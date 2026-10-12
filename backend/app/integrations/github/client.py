"""Small GitHub REST adapter: the only code that sends a project's token anywhere.

The token is wrapped in GitHubToken so it never shows up in a repr, a log line or an exception.
GitHubError messages are built from GitHub's response text and never include request headers.
"""

import base64
from typing import Optional
from urllib.parse import quote

import httpx

from app.config import settings

_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_API_VERSION = "2022-11-28"


class GitHubToken:
    """A secret token. Printing it shows only the last four characters."""

    __slots__ = ("_value",)

    def __init__(self, value: str):
        self._value = value.strip()

    def reveal(self) -> str:
        return self._value

    @property
    def hint(self) -> str:
        return "…" + self._value[-4:] if self._value else ""

    def __repr__(self) -> str:
        return f"GitHubToken({self.hint})"

    __str__ = __repr__


class GitHubError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _path(value: str) -> str:
    return quote(value, safe="/")


class GitHubClient:
    def __init__(self, token: GitHubToken, owner: str, repo: str, base_url: Optional[str] = None):
        self._token = token
        self.owner = owner
        self.repo = repo
        self._base = (base_url or settings.GITHUB_API_URL).rstrip("/")

    # ---- transport ---------------------------------------------------------------------------

    def _request(self, method: str, path: str, json: Optional[dict] = None, ok_404: bool = False):
        headers = {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self._token.reveal()}",
            "X-GitHub-Api-Version": _API_VERSION,
            "User-Agent": "Attest",
        }
        try:
            response = httpx.request(method, self._base + path, headers=headers, json=json, timeout=_TIMEOUT)
        except httpx.HTTPError as exc:
            raise GitHubError(0, f"Could not reach GitHub ({type(exc).__name__}).") from None
        if ok_404 and response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise GitHubError(response.status_code, _error_text(response))
        return response.json() if response.content else {}

    @property
    def _repo_path(self) -> str:
        return f"/repos/{_path(self.owner)}/{_path(self.repo)}"

    # ---- repository --------------------------------------------------------------------------

    def get_repo(self) -> dict:
        return self._request("GET", self._repo_path)

    def ensure_branch(self, branch: str) -> None:
        """Create `branch` from the default branch when it does not exist yet."""
        if self._request("GET", f"{self._repo_path}/branches/{_path(branch)}", ok_404=True) is not None:
            return
        default = self.get_repo().get("default_branch") or "main"
        ref = self._request("GET", f"{self._repo_path}/git/ref/heads/{_path(default)}", ok_404=True)
        if not ref:
            raise GitHubError(409, "The repository is empty. Push a first commit, then try again.")
        try:
            self._request(
                "POST",
                f"{self._repo_path}/git/refs",
                json={"ref": f"refs/heads/{branch}", "sha": ref["object"]["sha"]},
            )
        except GitHubError as exc:
            if exc.status != 422:  # 422: another request created it first
                raise

    def put_file(self, branch: str, path: str, content: bytes, message: str) -> None:
        """Create or replace a file on `branch`."""
        url = f"{self._repo_path}/contents/{_path(path)}"
        body = {"message": message, "content": base64.b64encode(content).decode("ascii"), "branch": branch}
        existing = self._request("GET", f"{url}?ref={quote(branch)}", ok_404=True)
        if isinstance(existing, dict) and existing.get("sha"):
            body["sha"] = existing["sha"]
        self._request("PUT", url, json=body)

    def file_url(self, branch: str, path: str) -> str:
        """Browser URL that renders the raw file for anyone who can see the repo (private too)."""
        return f"https://github.com/{self.owner}/{self.repo}/blob/{quote(branch)}/{_path(path)}?raw=true"

    # ---- issues ------------------------------------------------------------------------------

    def create_issue(self, title: str, body: str, labels: Optional[list[str]] = None) -> dict:
        payload: dict = {"title": title, "body": body}
        if labels:
            payload["labels"] = labels
        return self._request("POST", f"{self._repo_path}/issues", json=payload)

    def get_issue(self, number: int) -> Optional[dict]:
        return self._request("GET", f"{self._repo_path}/issues/{int(number)}", ok_404=True)

    def comment(self, number: int, body: str) -> dict:
        return self._request("POST", f"{self._repo_path}/issues/{int(number)}/comments", json={"body": body})


def revoke_token(token: GitHubToken, base_url: Optional[str] = None) -> None:
    """Ask GitHub to revoke a token (POST /credentials/revoke). Needs no authentication."""
    base = (base_url or settings.GITHUB_API_URL).rstrip("/")
    try:
        response = httpx.post(
            base + "/credentials/revoke",
            headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": _API_VERSION, "User-Agent": "Attest"},
            json={"credentials": [token.reveal()]},
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise GitHubError(0, f"Could not reach GitHub ({type(exc).__name__}).") from None
    if response.status_code >= 400:
        raise GitHubError(response.status_code, _error_text(response))


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        message = str(data.get("message") or "")
    except ValueError:
        message = ""
    return f"GitHub returned {response.status_code}{': ' + message[:200] if message else ''}."
