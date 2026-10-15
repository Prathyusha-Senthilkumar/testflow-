"""GitHub integration: link a project to one repository and open issues for failed runs.

Failed runs are found by a background poll (the worker writes results straight to Supabase, so
there is no completion hook). Each run is claimed by inserting its github_issues row first, so
two backends never file it twice. A test case that already has an open Attest issue gets a
comment instead of a second issue.

Screenshots and the PDF report are committed to the `attest-reports` branch of the linked
repository and shown inline in the issue, because GitHub's API cannot attach files to issues.

The token is Fernet-encrypted at rest (TESTFLOW_SECRET_KEY), decrypted only to make a GitHub
call, and never returned, logged or put in an error message.
"""

import logging
import re
import threading
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import HTTPException

from app.config import settings
from app.integrations.github.client import GitHubClient, GitHubError, GitHubToken, revoke_token
from app.repositories.github_repository import GitHubRepository, GitHubTablesMissing, github_repository
from app.repositories.project_repository import project_repository
from app.repositories.test_run_repository import TestRunRepository, test_run_repository
from app.schemas.github import (
    DisconnectResult,
    GitHubConnection,
    RunGitHubIssue,
    RunGitHubIssueStatus,
    SaveGitHubConnection,
)
from app.services import secret_store
from app.services.run_report_pdf import build_run_pdf, friendly_step_label, report_file_name, split_failure

logger = logging.getLogger("testflow.github")

REPORTS_BRANCH = "attest-reports"
MAX_ATTEMPTS = 3
_MAX_BODY = 60000
_MAX_STEP_IMAGES = 25

MIGRATION_MESSAGE = (
    "GitHub isn't set up on the server yet. Ask your administrator to apply "
    "supabase/migrations/20261012_github_integration.sql, then try again."
)
SECRET_KEY_MESSAGE = (
    "Attest can't store GitHub tokens securely yet because TESTFLOW_SECRET_KEY isn't configured "
    "on the server. Ask your administrator to set it, then try again."
)
UNREADABLE_TOKEN_MESSAGE = (
    "The saved GitHub token can't be read (the server's encryption key changed). "
    "Replace the token in Project › Integrations."
)
_TOKEN_PERMISSIONS = "Issues: Read and write, Contents: Read and write"

ClientFactory = Callable[[GitHubToken, str, str], GitHubClient]


# ---- friendly errors --------------------------------------------------------------------------


def explain(exc: GitHubError, owner: str, repo: str, action: str = "issues") -> str:
    """Turn a GitHub refusal into a message that says what to change and where."""
    full = f"{owner}/{repo}"
    raw = (exc.message or "").lower()
    if exc.status == 0:
        return "Attest couldn't reach GitHub. Check the server's internet access and try again."
    if exc.status == 401:
        return (
            "GitHub rejected the token: it has expired, been revoked or was mistyped. "
            "Create a new fine-grained token and use Replace token in Project › Integrations."
        )
    if "rate limit" in raw:
        return "GitHub's rate limit was reached. Attest will try again in a few minutes."
    if "saml" in raw or "sso" in raw:
        return (
            f"{owner} uses single sign-on. On GitHub, open Settings › Developer settings › "
            "Personal access tokens, then authorize this token for the organization."
        )
    if "fine-grained" in raw and ("forbid" in raw or "not allow" in raw or "approval" in raw):
        return (
            f"The {owner} organization hasn't approved this fine-grained token yet, or doesn't allow them. "
            "Ask an organization owner to approve it under Settings › Personal access tokens."
        )
    if exc.status == 404:
        return (
            f"Repository {full} wasn't found, or the token can't see it. When creating the token, "
            f"choose 'Only select repositories' and pick {full}."
        )
    if exc.status == 410 or "issues are disabled" in raw or "issues has been disabled" in raw:
        return f"Issues are turned off for {full}. Turn them on in the repo's Settings › General › Features."
    if exc.status == 403:
        permission = "Contents: Read and write" if action == "contents" else "Issues: Read and write"
        return (
            f"The token isn't allowed to {'save files to' if action == 'contents' else 'create issues in'} {full}. "
            f"On GitHub, edit the token and set Repository permissions › {permission}."
        )
    if exc.status == 409 and "empty" in raw:
        return f"{full} is empty. Push a first commit so Attest can add the reports branch."
    if exc.status == 422 and action == "issues":
        return f"GitHub refused the issue for {full} ({exc.message}). Check the repo's issue settings."
    return f"GitHub couldn't complete the request for {full}. {exc.message}"


def _parse_repo(value: str) -> tuple[str, str]:
    text = value.strip()
    match = re.match(r"^(?:https?://)?(?:www\.)?github\.com/([^/\s]+)/([^/\s#?]+)", text, re.I)
    if match:
        owner, name = match.group(1), match.group(2)
    else:
        parts = text.strip("/").split("/")
        if len(parts) != 2:
            raise HTTPException(400, "Enter the repository as owner/name, for example acme/shop-web, or paste its GitHub URL.")
        owner, name = parts
    name = re.sub(r"\.git$", "", name)
    if not re.fullmatch(r"[A-Za-z0-9-]{1,39}", owner) or not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", name):
        raise HTTPException(400, "That doesn't look like a GitHub repository. Use owner/name, for example acme/shop-web.")
    return owner, name


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class GitHubService:
    def __init__(
        self,
        repository: GitHubRepository = github_repository,
        runs: TestRunRepository = test_run_repository,
        client_factory: ClientFactory = GitHubClient,
        revoke: Callable[[GitHubToken], None] = revoke_token,
    ):
        self.repository = repository
        self.runs = runs
        self.client_factory = client_factory
        self.revoke = revoke
        self._cursor: Optional[str] = None

    # ---- connection ----------------------------------------------------------------------------

    def get(self, project_id: str) -> GitHubConnection:
        project_repository.find_by_id(project_id)
        try:
            row = self.repository.get_connection(project_id)
        except GitHubTablesMissing:
            return GitHubConnection(connected=False)
        return _connection_view(row)

    def save(self, project_id: str, dto: SaveGitHubConnection) -> GitHubConnection:
        project_repository.find_by_id(project_id)
        owner, name = _parse_repo(dto.repo)
        existing = self._connection(project_id)
        token_text = (dto.token or "").strip()
        if existing and (existing["owner"].lower(), existing["repo"].lower()) != (owner.lower(), name.lower()) and not token_text:
            raise HTTPException(400, "To link a different repository, paste a token for that repository too.")
        if not token_text and not existing:
            raise HTTPException(400, "Paste a GitHub token to connect this repository.")
        if token_text and not re.fullmatch(r"[A-Za-z0-9_]{20,255}", token_text):
            raise HTTPException(400, "That doesn't look like a GitHub token. Fine-grained tokens start with github_pat_.")
        token = GitHubToken(token_text) if token_text else self._token(existing)

        client = self.client_factory(token, owner, name)
        try:
            details = client.get_repo()
        except GitHubError as exc:
            raise HTTPException(400, explain(exc, owner, name)) from None
        if details.get("has_issues") is False:
            raise HTTPException(400, f"Issues are turned off for {owner}/{name}. Turn them on in the repo's Settings › General › Features.")
        permissions = details.get("permissions")
        if isinstance(permissions, dict) and permissions and not (permissions.get("push") or permissions.get("triage")):
            raise HTTPException(
                400,
                f"The token can read {owner}/{name} but can't write to it. Give it {_TOKEN_PERMISSIONS} for this repository.",
            )
        owner, name = details.get("owner", {}).get("login") or owner, details.get("name") or name

        values: dict = {"owner": owner, "repo": name}
        if token_text:
            if not secret_store.is_configured():
                raise HTTPException(409, SECRET_KEY_MESSAGE)
            values["token_encrypted"] = secret_store.encrypt_mapping({"token": token.reveal()})
            values["token_hint"] = token.hint
        if dto.autoCreateIssues is not None:
            values["auto_create_issues"] = dto.autoCreateIssues
        try:
            row = self.repository.save_connection(project_id, values)
        except GitHubTablesMissing:
            raise HTTPException(409, MIGRATION_MESSAGE) from None
        logger.info("event=github_connected project_id=%s repo=%s/%s token_replaced=%s", project_id, owner, name, bool(token_text))
        return _connection_view(row)

    def disconnect(self, project_id: str, revoke: bool = False) -> DisconnectResult:
        """Remove the stored token. With `revoke`, also ask GitHub to revoke it everywhere."""
        project_repository.find_by_id(project_id)
        existing = self._connection(project_id)
        if not existing:
            return DisconnectResult(revoked=False, message="This project isn't linked to GitHub.")
        revoked = False
        message = "Disconnected. The token was deleted from Attest."
        if revoke:
            try:
                self.revoke(self._token(existing))
                revoked = True
                message = "Disconnected, and GitHub revoked the token, so it no longer works anywhere."
            except HTTPException:
                message = "Disconnected. The saved token couldn't be read, so revoke it yourself on GitHub."
            except GitHubError:
                message = (
                    "Disconnected and deleted from Attest, but GitHub didn't confirm the revocation. "
                    "Delete the token yourself under GitHub › Settings › Developer settings › Personal access tokens."
                )
        try:
            self.repository.delete_connection(project_id)
        except GitHubTablesMissing:
            raise HTTPException(409, MIGRATION_MESSAGE) from None
        logger.info("event=github_disconnected project_id=%s revoked=%s", project_id, revoked)
        return DisconnectResult(revoked=revoked, message=message)

    def _connection(self, project_id: str) -> Optional[dict]:
        try:
            return self.repository.get_connection(project_id)
        except GitHubTablesMissing:
            raise HTTPException(409, MIGRATION_MESSAGE) from None

    @staticmethod
    def _token(connection: dict) -> GitHubToken:
        try:
            payload = secret_store.decrypt_mapping(str(connection.get("token_encrypted") or ""))
        except secret_store.SecretUnavailableError:
            raise HTTPException(409, SECRET_KEY_MESSAGE) from None
        except secret_store.SecretDecryptError:
            raise HTTPException(409, UNREADABLE_TOKEN_MESSAGE) from None
        token = str((payload or {}).get("token") or "")
        if not token:
            raise HTTPException(409, UNREADABLE_TOKEN_MESSAGE)
        return GitHubToken(token)

    # ---- issues for a run ----------------------------------------------------------------------

    def issue_status(self, run_id: str) -> RunGitHubIssueStatus:
        report = self.runs.get_report(run_id)
        if not report:
            raise HTTPException(404, "Test run not found")
        try:
            connection = self.repository.get_connection(str(report.get("projectId") or "")) if report.get("projectId") else None
            row = self.repository.get_issue_for_run(run_id)
        except GitHubTablesMissing:
            return RunGitHubIssueStatus(connected=False)
        return RunGitHubIssueStatus(connected=bool(connection), issue=_issue_view(row))

    def file_now(self, run_id: str) -> RunGitHubIssueStatus:
        """File (or retry) the issue for one failed run now. Safe alongside the background poll."""
        report = self.runs.get_report(run_id)
        if not report:
            raise HTTPException(404, "Test run not found")
        if str(report.get("status")) != "Failed":
            raise HTTPException(400, "Only failed runs can be filed as GitHub issues.")
        project_id = str(report.get("projectId") or "")
        connection = self._connection(project_id) if project_id else None
        if not connection:
            raise HTTPException(400, "Link this project to a GitHub repository first (Project › Integrations).")
        token = self._token(connection)
        row = self.repository.get_issue_for_run(run_id)
        if row is None:
            claimed = self.repository.claim_run(run_id, project_id, report.get("testCaseId"))
        elif row["state"] == "error":
            claimed = self.repository.claim_retry(run_id, int(row.get("attempts") or 0))
        else:
            claimed = False  # already filed, or being filed right now
        if claimed:
            self._file(report, connection, token)
        return self.issue_status(run_id)

    def _file(self, report: dict, connection: dict, token: GitHubToken) -> None:
        run_id = str(report["id"])
        owner, name = connection["owner"], connection["repo"]
        client = self.client_factory(token, owner, name)
        try:
            images, pdf_url, upload_note = self._upload_artifacts(client, report, connection)
            case_id = report.get("testCaseId")
            open_row = self.repository.open_issue_for_case(connection["project_id"], case_id) if case_id else None
            if open_row:
                current = client.get_issue(int(open_row["issue_number"]))
                if current and current.get("state") == "open":
                    client.comment(int(open_row["issue_number"]), _issue_body(report, images, pdf_url, upload_note, again=True))
                    self.repository.update_issue(run_id, {
                        "state": "open", "issue_number": open_row["issue_number"],
                        "issue_url": open_row["issue_url"], "commented": True, "last_error": None,
                    })
                    logger.info("event=github_issue_commented run_id=%s issue=%s", run_id, open_row["issue_number"])
                    return
                self.repository.set_issue_state(connection["project_id"], int(open_row["issue_number"]), "closed")
            issue = client.create_issue(_issue_title(report), _issue_body(report, images, pdf_url, upload_note))
            self.repository.update_issue(run_id, {
                "state": "open", "issue_number": issue.get("number"), "issue_url": issue.get("html_url"),
                "commented": False, "last_error": None,
            })
            logger.info("event=github_issue_created run_id=%s issue=%s", run_id, issue.get("number"))
        except GitHubError as exc:
            message = explain(exc, owner, name)
            self.repository.update_issue(run_id, {"state": "error", "last_error": message})
            from app.logging_format import log_failure

            log_failure(logger, f"github.issue run_id={run_id}", exc, level=logging.WARNING)
        except Exception as exc:
            self.repository.update_issue(run_id, {"state": "error", "last_error": "Attest hit an unexpected error filing this issue."})
            from app.logging_format import log_failure

            log_failure(logger, f"github.issue run_id={run_id}", exc)

    def _upload_artifacts(self, client: GitHubClient, report: dict, connection: dict) -> tuple[list[dict], Optional[str], Optional[str]]:
        """Commit screenshots and the PDF. A refusal here still files the issue, with a note."""
        run_id = str(report["id"])
        steps = self.runs.screenshot_steps(run_id)
        folder = f"{REPORTS_BRANCH}/{connection['project_id']}/{run_id}"
        try:
            client.ensure_branch(REPORTS_BRANCH)
            images = []
            for index, step in enumerate(steps[:_MAX_STEP_IMAGES]):
                path = self.runs.screenshot_named(run_id, str(step.get("file") or ""))
                url = None
                if path is not None:
                    target = f"{folder}/{step['file']}"
                    client.put_file(REPORTS_BRANCH, target, path.read_bytes(), f"Attest: screenshot for run {run_id[:8]}")
                    url = client.file_url(REPORTS_BRANCH, target)
                images.append({**step, "index": index, "url": url})
            pdf = build_run_pdf(report, steps, lambda file: self.runs.screenshot_named(run_id, file))
            pdf_path = f"{folder}/{report_file_name(report)}"
            client.put_file(REPORTS_BRANCH, pdf_path, pdf, f"Attest: report for run {run_id[:8]}")
            return images, client.file_url(REPORTS_BRANCH, pdf_path), None
        except GitHubError as exc:
            if exc.status in (401, 0) or "rate limit" in (exc.message or "").lower():
                raise
            note = explain(exc, client.owner, client.repo, action="contents")
            from app.logging_format import log_failure

            log_failure(logger, f"github.upload run_id={run_id}", exc, level=logging.WARNING)
            return [{**step, "index": i, "url": None} for i, step in enumerate(steps[:_MAX_STEP_IMAGES])], None, note

    def pdf(self, run_id: str) -> tuple[bytes, str]:
        report = self.runs.get_report(run_id)
        if not report:
            raise HTTPException(404, "Test run not found")
        steps = self.runs.screenshot_steps(run_id)
        content = build_run_pdf(report, steps, lambda file: self.runs.screenshot_named(run_id, file))
        return content, report_file_name(report)

    # ---- background poll -----------------------------------------------------------------------

    def poll_once(self) -> int:
        """File issues for new failed runs and retry errored ones. Returns how many were attempted."""
        try:
            connections = {row["project_id"]: row for row in self.repository.list_auto_connections()}
        except GitHubTablesMissing:
            return 0
        if not connections:
            return 0
        attempted = 0
        earliest = min(str(row.get("created_at") or _now()) for row in connections.values())
        since = max(earliest, self._cursor) if self._cursor else earliest
        for report in self.runs.list_failed_since(since):
            self._cursor = max(self._cursor or "", str(report.get("completedAt") or ""))
            connection = connections.get(str(report.get("projectId") or ""))
            if not connection or str(report.get("completedAt") or "") <= str(connection.get("created_at") or ""):
                continue
            if self.repository.get_issue_for_run(str(report["id"])):
                continue
            if not self.repository.claim_run(str(report["id"]), connection["project_id"], report.get("testCaseId")):
                continue
            attempted += 1
            self._file_with_connection(report, connection)
        for row in self.repository.list_errored(MAX_ATTEMPTS):
            connection = connections.get(row["project_id"])
            if not connection or not _retry_due(row):
                continue
            if not self.repository.claim_retry(row["run_id"], int(row.get("attempts") or 0)):
                continue
            report = self.runs.get_report(row["run_id"])
            if report:
                attempted += 1
                self._file_with_connection(report, connection)
        return attempted

    def _file_with_connection(self, report: dict, connection: dict) -> None:
        try:
            token = self._token(connection)
        except HTTPException as exc:
            self.repository.update_issue(str(report["id"]), {"state": "error", "last_error": str(exc.detail)})
            return
        self._file(report, connection, token)


def _retry_due(row: dict) -> bool:
    """Back off 2, 4, 8… minutes after each failed attempt."""
    try:
        updated = datetime.fromisoformat(str(row.get("updated_at")).replace("Z", "+00:00"))
    except ValueError:
        return True
    wait = 60 * 2 ** max(1, int(row.get("attempts") or 1))
    return (datetime.now(timezone.utc) - updated).total_seconds() >= wait


def _connection_view(row: Optional[dict]) -> GitHubConnection:
    if not row:
        return GitHubConnection(connected=False)
    return GitHubConnection(
        connected=True,
        owner=row["owner"],
        repo=row["repo"],
        repoUrl=f"https://github.com/{row['owner']}/{row['repo']}",
        tokenHint=row.get("token_hint") or None,
        autoCreateIssues=bool(row.get("auto_create_issues", True)),
        connectedAt=str(row.get("created_at") or "") or None,
    )


def _issue_view(row: Optional[dict]) -> Optional[RunGitHubIssue]:
    if not row:
        return None
    return RunGitHubIssue(
        number=row.get("issue_number"),
        url=row.get("issue_url"),
        state=row["state"],
        createdAt=str(row.get("created_at") or ""),
        commented=bool(row.get("commented")),
        error=row.get("last_error") if row["state"] == "error" else None,
    )


def _run_link(report: dict) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/projects/{report.get('projectId')}/results/{report.get('id')}"


def _issue_title(report: dict) -> str:
    code = f"{report['testCaseCode']}: " if report.get("testCaseCode") else ""
    return f"[Attest] {code}{report.get('testName') or 'Test'} failed"[:250]


def _issue_body(report: dict, images: list[dict], pdf_url: Optional[str], upload_note: Optional[str], again: bool = False) -> str:
    failed_step = next((step for step in images if step.get("failed")), None)
    lines = [
        f"### {'Failed again' if again else 'Test failed'}: {report.get('testName') or 'Test'}",
        "",
        "| | |",
        "|---|---|",
        f"| Project | {_cell(report.get('projectName'))} |",
        f"| Suite | {_cell(report.get('suiteName'))} |",
        f"| Run | [{str(report.get('id'))[:8]}]({_run_link(report)}) |",
        f"| Executed | {_cell(report.get('startedAt'))} |",
    ]
    if report.get("runBy"):
        lines.append(f"| Run by | {_cell(report.get('runBy'))} |")
    if failed_step:
        lines.append(f"| Failed at | Step {failed_step['index'] + 1}: {_cell(friendly_step_label(failed_step.get('label', '')))} |")
    error = str(report.get("errorMessage") or "").strip()
    if error and not failed_step:
        summary, details = split_failure(error)
        lines += ["", f"**Failure reason:** {summary}"]
        if details:
            lines += ["", "<details><summary>Technical details</summary>", "", "```", details[:4000], "```", "", "</details>"]
    if images:
        lines += ["", "#### Steps", ""]
        for step in images:
            name = friendly_step_label(step.get("label", ""))
            mark = "❌" if step.get("failed") else "✅"
            lines.append(f"**{mark} Step {step['index'] + 1}: {name}**")
            if step.get("failed"):
                summary, details = split_failure(str(step.get("error") or "Step failed, but no failure details were provided."))
                lines.append(f"> {summary}")
                if details:
                    lines += ["", "<details><summary>Technical details</summary>", "", "```", details[:4000], "```", "", "</details>"]
            if step.get("url"):
                lines += ["", f'<img src="{step["url"]}" alt="Step {step["index"] + 1}: {_attr(name)}" width="720">']
            lines.append("")
    links = [f"[View run in Attest]({_run_link(report)})"]
    if pdf_url:
        links.insert(0, f"📄 [PDF report]({pdf_url})")
    lines += ["", " · ".join(links)]
    if upload_note:
        lines += ["", f"> [!NOTE]\n> Screenshots and the PDF weren't added: {upload_note}"]
    if not again:
        lines += ["", "<sub>Opened automatically by Attest. Later failures of this test are added as comments while this issue is open.</sub>"]
    body = "\n".join(lines)
    return body if len(body) <= _MAX_BODY else body[:_MAX_BODY] + "\n\n…(truncated)"


def _cell(value) -> str:
    return str(value or "—").replace("|", "\\|").replace("\n", " ")


def _attr(value: str) -> str:
    return value.replace('"', "'").replace("<", "").replace(">", "")


github_service = GitHubService()


def poll_issues_forever(stop: threading.Event) -> None:
    from app.logging_format import bind_background, log_failure

    while not stop.wait(max(5, settings.GITHUB_ISSUE_POLL_SECONDS)):
        bind_background("github-poll")
        try:
            github_service.poll_once()
        except Exception as exc:
            log_failure(logger, "github.poll", exc)
