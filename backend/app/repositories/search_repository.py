"""Candidate lookups for global search.

The repository only fetches bounded candidate rows and the names needed to
describe them. Ranking, limits and display text belong to ``SearchService``.

Live schema (see supabase/migrations/20261007_page_overview.sql):
project -> test_suites(project_id) -> test_cases(suite_id) -> test_runs(test_case_id).
The case code column is ``test_case_code`` (schema.sql still says ``code``).
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional

from postgrest.exceptions import APIError

from app.database import get_supabase_client
from app.repositories.project_repository import project_repository
from app.repositories.test_case_repository import test_case_repository
from app.repositories.test_suite_repository import test_suite_repository

logger = logging.getLogger("testflow.search")

# Upper bound of rows fetched per type before ranking in Python.
CANDIDATE_LIMIT = 100
_DIRECTORY_LIMIT = 2000

# Run statuses as stored in test_runs.status, keyed by the search keyword.
RUN_STATUS_KEYWORDS: Dict[str, str] = {
    "failed": "Failed",
    "passed": "Passed",
    "running": "Running",
    "queued": "Queued",
}


@dataclass
class CandidateSet:
    total: int = 0
    rows: List[dict] = field(default_factory=list)


@dataclass
class SearchSnapshot:
    """Candidates per type plus the name directories used to describe them."""

    groups: Dict[str, CandidateSet] = field(default_factory=dict)
    project_names: Dict[str, str] = field(default_factory=dict)
    suites: Dict[str, dict] = field(default_factory=dict)  # id -> {name, project_id}


def escape_like(text: str) -> str:
    """Escape LIKE wildcards so user input matches literally."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _quoted(value: str) -> str:
    # PostgREST logic-tree values: wrap in quotes, escape backslash and quote.
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _is_missing_column(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    message = str(getattr(exc, "message", "") or exc)
    return code in ("42703", "PGRST204") or ("column" in message and "does not exist" in message)


class SearchRepository:
    # Columns that may be absent on the live database; dropped after the first failure.
    _optional_columns: Dict[str, bool] = {"projects.updated_at": True, "test_cases.updated_at": True}

    def __init__(self):
        # Demo mode persists no runs (TestRunRepository no-ops); tests may seed this list
        # with {id, test_case_id, status, started_at, completed_at}.
        self.demo_runs: List[dict] = []

    @property
    def db(self):
        return get_supabase_client()

    # ---- public API -------------------------------------------------------
    def find_candidates(
        self,
        pattern_text: str,
        types: Iterable[str],
        project_id: Optional[str],
        run_statuses: List[str],
    ) -> SearchSnapshot:
        types = set(types)
        if not self.db:
            return self._demo_candidates(pattern_text, types, project_id, run_statuses)
        return self._db_candidates(pattern_text, types, project_id, run_statuses)

    def enrich(self, snapshot: SearchSnapshot, selected: Dict[str, List[dict]]) -> None:
        """Add case counts, latest statuses and run case names to the selected rows only."""
        if not self.db:
            self._demo_enrich(snapshot, selected)
            return

        suites = selected.get("suite") or []
        cases = selected.get("test_case") or []
        runs = selected.get("run") or []
        missing_case_ids = list({r["test_case_id"] for r in runs if r.get("test_case_id") and not r.get("case_name")})

        with ThreadPoolExecutor(max_workers=3) as pool:
            counts_f = pool.submit(
                test_suite_repository._case_counts, [s["id"] for s in suites]
            ) if suites else None
            latest_f = pool.submit(self._latest_statuses, [c["id"] for c in cases]) if cases else None
            missing_f = pool.submit(self._cases_by_id, missing_case_ids) if missing_case_ids else None
            counts = counts_f.result() if counts_f else {}
            latest = latest_f.result() if latest_f else {}
            missing = missing_f.result() if missing_f else {}

        for suite in suites:
            suite["case_count"] = counts.get(suite["id"], 0)
        for case in cases:
            case["latest_status"] = latest.get(case["id"])
        for run in runs:
            info = missing.get(run.get("test_case_id") or "")
            if info:
                run.update(info)

    # ---- Supabase ---------------------------------------------------------
    def _db_candidates(
        self, text: str, types: set, project_id: Optional[str], run_statuses: List[str]
    ) -> SearchSnapshot:
        like = f"%{escape_like(text)}%"
        snapshot = SearchSnapshot()
        need_suites = bool(types & {"test_case", "run"})
        need_projects = bool(types & {"suite", "test_case", "run"})

        scoped_suite_ids: Optional[List[str]] = None
        if project_id:
            # One extra round trip: cases have no project_id, they hang off suites.
            snapshot.suites = self._suite_directory(project_id)
            scoped_suite_ids = list(snapshot.suites)

        with ThreadPoolExecutor(max_workers=7) as pool:
            futures: Dict[str, object] = {}
            if "project" in types:
                futures["project"] = pool.submit(self._projects, like, project_id)
            if "suite" in types:
                futures["suite"] = pool.submit(self._suites, like, project_id)
            if types & {"test_case", "run"}:
                futures["test_case"] = pool.submit(self._cases, like, scoped_suite_ids)
            if need_suites and not project_id:
                futures["_suites"] = pool.submit(self._suite_directory, None)
            if need_projects:
                futures["_projects"] = pool.submit(self._project_directory, project_id)
            if "run" in types:
                case_future = futures["test_case"]
                futures["run"] = pool.submit(
                    self._runs, case_future, run_statuses, scoped_suite_ids
                )
            results = {key: future.result() for key, future in futures.items()}

        if "_suites" in results:
            snapshot.suites = results["_suites"]
        snapshot.project_names = results.get("_projects") or {}
        for key in ("project", "suite", "test_case", "run"):
            if key in types and key in results:
                snapshot.groups[key] = results[key]

        # Fill project ids on cases/runs from the suite directory.
        for key in ("test_case", "run"):
            for row in (snapshot.groups.get(key) or CandidateSet()).rows:
                suite = snapshot.suites.get(row.get("suite_id") or "")
                if suite and not row.get("project_id"):
                    row["project_id"] = suite["project_id"]
        return snapshot

    def _select(self, table: str, columns: List[str], build: Callable) -> object:
        """Run ``build(select_string)`` and drop optional columns the live table lacks."""
        cols = [c for c in columns if self._optional_columns.get(f"{table}.{c}", True)]
        try:
            return build(",".join(cols)).execute()
        except APIError as exc:
            optional = [c for c in cols if f"{table}.{c}" in self._optional_columns]
            if not optional or not _is_missing_column(exc):
                raise
            for column in optional:
                SearchRepository._optional_columns[f"{table}.{column}"] = False
            logger.info("event=search_optional_columns_disabled table=%s columns=%s", table, optional)
            return build(",".join(c for c in cols if c not in optional)).execute()

    @staticmethod
    def _candidate_set(res) -> CandidateSet:
        rows = res.data or []
        total = getattr(res, "count", None)
        return CandidateSet(total=int(total) if total is not None else len(rows), rows=rows)

    def _projects(self, like: str, project_id: Optional[str]) -> CandidateSet:
        def build(cols: str):
            query = (
                self.db.from_("projects")
                .select(cols, count="exact")
                .or_(f"name.ilike.{_quoted(like)},base_url.ilike.{_quoted(like)}")
            )
            if project_id:
                query = query.eq("id", project_id)
            return query.order("created_at", desc=True).limit(CANDIDATE_LIMIT)

        res = self._select("projects", ["id", "name", "base_url", "created_at", "updated_at"], build)
        result = self._candidate_set(res)
        result.rows = [
            {
                "id": str(row["id"]),
                "name": row.get("name") or "",
                "base_url": row.get("base_url") or "",
                "updated_at": row.get("updated_at") or row.get("created_at"),
            }
            for row in result.rows
        ]
        return result

    def _suites(self, like: str, project_id: Optional[str]) -> CandidateSet:
        query = (
            self.db.from_("test_suites")
            .select("id,name,project_id,created_at", count="exact")
            .ilike("name", like)
        )
        if project_id:
            query = query.eq("project_id", project_id)
        res = query.order("created_at", desc=True).limit(CANDIDATE_LIMIT).execute()
        result = self._candidate_set(res)
        result.rows = [
            {
                "id": str(row["id"]),
                "name": row.get("name") or "",
                "project_id": str(row.get("project_id") or "") or None,
                "updated_at": row.get("created_at"),
            }
            for row in result.rows
        ]
        return result

    def _cases(self, like: str, suite_ids: Optional[List[str]]) -> CandidateSet:
        if suite_ids is not None and not suite_ids:
            return CandidateSet()

        def build(cols: str):
            query = (
                self.db.from_("test_cases")
                .select(cols, count="exact")
                .or_(f"name.ilike.{_quoted(like)},test_case_code.ilike.{_quoted(like)}")
            )
            if suite_ids is not None:
                query = query.in_("suite_id", suite_ids)
            return query.order("created_at", desc=True).limit(CANDIDATE_LIMIT)

        res = self._select(
            "test_cases", ["id", "name", "test_case_code", "suite_id", "created_at", "updated_at"], build
        )
        result = self._candidate_set(res)
        result.rows = [
            {
                "id": str(row["id"]),
                "name": row.get("name") or "",
                "code": row.get("test_case_code") or "",
                "suite_id": str(row.get("suite_id") or "") or None,
                "updated_at": row.get("updated_at") or row.get("created_at"),
            }
            for row in result.rows
        ]
        return result

    def _runs(
        self, case_future, run_statuses: List[str], suite_ids: Optional[List[str]]
    ) -> CandidateSet:
        cases: CandidateSet = case_future.result()
        case_info = {
            row["id"]: {"case_name": row["name"], "case_code": row["code"], "suite_id": row["suite_id"]}
            for row in cases.rows
        }
        conditions = []
        if case_info:
            conditions.append(f"test_case_id.in.({','.join(case_info)})")
        conditions.extend(f"status.eq.{_quoted(status)}" for status in run_statuses)
        if not conditions:
            return CandidateSet()

        query = (
            self.db.from_("test_runs")
            .select("id,test_case_id,status,started_at,completed_at,error_message", count="exact")
            .or_(",".join(conditions))
        )
        if suite_ids is not None and run_statuses:
            # Status matches must stay inside the project: restrict to its cases.
            project_case_ids = self._case_ids_for_suites(suite_ids)
            if not project_case_ids:
                return CandidateSet()
            query = query.in_("test_case_id", project_case_ids)
        res = query.order("started_at", desc=True).limit(CANDIDATE_LIMIT).execute()
        result = self._candidate_set(res)
        result.rows = [self._run_row(row, case_info) for row in result.rows]
        return result

    @staticmethod
    def _run_row(row: dict, case_info: Dict[str, dict]) -> dict:
        case_id = str(row.get("test_case_id") or "")
        return {
            "id": str(row["id"]),
            "test_case_id": case_id or None,
            "status": row.get("status"),
            "error_message": row.get("error_message"),
            "started_at": row.get("started_at"),
            "completed_at": row.get("completed_at"),
            "updated_at": row.get("completed_at") or row.get("started_at"),
            **(case_info.get(case_id) or {}),
        }

    def _case_ids_for_suites(self, suite_ids: List[str]) -> List[str]:
        if not suite_ids:
            return []
        rows = (
            self.db.from_("test_cases").select("id").in_("suite_id", suite_ids).execute().data or []
        )
        return [str(row["id"]) for row in rows]

    def _suite_directory(self, project_id: Optional[str]) -> Dict[str, dict]:
        query = self.db.from_("test_suites").select("id,name,project_id")
        if project_id:
            query = query.eq("project_id", project_id)
        rows = query.limit(_DIRECTORY_LIMIT).execute().data or []
        return {
            str(row["id"]): {"name": row.get("name") or "", "project_id": str(row.get("project_id") or "")}
            for row in rows
        }

    def _project_directory(self, project_id: Optional[str]) -> Dict[str, str]:
        query = self.db.from_("projects").select("id,name")
        if project_id:
            query = query.eq("id", project_id)
        rows = query.limit(_DIRECTORY_LIMIT).execute().data or []
        return {str(row["id"]): row.get("name") or "" for row in rows}

    def _latest_statuses(self, case_ids: List[str]) -> Dict[str, str]:
        """Latest run status per case, from a bounded slice of recent runs."""
        if not case_ids:
            return {}
        rows = (
            self.db.from_("test_runs")
            .select("test_case_id,status,error_message")
            .in_("test_case_id", case_ids)
            .order("started_at", desc=True)
            .limit(len(case_ids) * 10)
            .execute()
            .data
            or []
        )
        latest: Dict[str, dict] = {}
        for row in rows:
            latest.setdefault(str(row["test_case_id"]), row)
        return {cid: {"status": r.get("status"), "error_message": r.get("error_message")} for cid, r in latest.items()}

    def _cases_by_id(self, case_ids: List[str]) -> Dict[str, dict]:
        rows = (
            self.db.from_("test_cases")
            .select("id,name,test_case_code,suite_id")
            .in_("id", case_ids)
            .execute()
            .data
            or []
        )
        return {
            str(row["id"]): {
                "case_name": row.get("name") or "",
                "case_code": row.get("test_case_code") or "",
                "suite_id": str(row.get("suite_id") or "") or None,
            }
            for row in rows
        }

    # ---- Demo mode --------------------------------------------------------
    def _demo_candidates(
        self, text: str, types: set, project_id: Optional[str], run_statuses: List[str]
    ) -> SearchSnapshot:
        needle = text.lower()
        snapshot = SearchSnapshot()
        projects = [
            p for p in project_repository.demo_projects.values() if not project_id or p.id == project_id
        ]
        snapshot.project_names = {p.id: p.name for p in projects}

        suites: Dict[str, dict] = {}
        for project in projects:
            for summary in project.suitesList:
                suites[summary.id] = {
                    "id": summary.id, "name": summary.name, "project_id": project.id,
                    "updated_at": summary.lastRun, "case_count": summary.cases,
                }
            for suite in test_suite_repository.demo_suites.get(project.id, []):
                suites[suite.id] = {
                    "id": suite.id, "name": suite.name, "project_id": project.id,
                    "updated_at": suite.createdAt, "case_count": None,
                }
        snapshot.suites = {sid: {"name": s["name"], "project_id": s["project_id"]} for sid, s in suites.items()}

        case_suite: Dict[str, str] = {}
        for key, members in test_suite_repository.demo_suite_cases.items():
            suite_id = key.split(":", 1)[1]
            for case_id in members:
                case_suite.setdefault(case_id, suite_id)

        cases: List[dict] = []
        for project in projects:
            for case in test_case_repository.demo_cases.get(project.id, []):
                cases.append({
                    "id": case.id, "name": case.name, "code": case.code,
                    "suite_id": getattr(case, "suiteId", None) or case_suite.get(case.id),
                    "project_id": project.id, "updated_at": None,
                })

        def contains(*values: Optional[str]) -> bool:
            return any(needle in (v or "").lower() for v in values)

        if "project" in types:
            rows = [
                {"id": p.id, "name": p.name, "base_url": p.baseUrl, "updated_at": p.lastRun}
                for p in projects if contains(p.name, p.baseUrl)
            ]
            snapshot.groups["project"] = CandidateSet(total=len(rows), rows=rows[:CANDIDATE_LIMIT])
        if "suite" in types:
            rows = [dict(s) for s in suites.values() if contains(s["name"])]
            snapshot.groups["suite"] = CandidateSet(total=len(rows), rows=rows[:CANDIDATE_LIMIT])
        matched_cases = [dict(c) for c in cases if contains(c["name"], c["code"])]
        if "test_case" in types:
            snapshot.groups["test_case"] = CandidateSet(total=len(matched_cases), rows=matched_cases[:CANDIDATE_LIMIT])
        if "run" in types:
            case_by_id = {c["id"]: c for c in cases}
            matched_ids = {c["id"] for c in matched_cases[:CANDIDATE_LIMIT]}
            rows = []
            for run in self.demo_runs:
                case = case_by_id.get(run.get("test_case_id"))
                if not case:
                    continue  # outside the project scope or deleted
                if run.get("test_case_id") in matched_ids or run.get("status") in run_statuses:
                    rows.append({
                        **self._run_row(run, {}),
                        "case_name": case["name"], "case_code": case["code"],
                        "suite_id": case["suite_id"], "project_id": case["project_id"],
                    })
            rows.sort(key=lambda r: r.get("started_at") or "", reverse=True)
            snapshot.groups["run"] = CandidateSet(total=len(rows), rows=rows[:CANDIDATE_LIMIT])
        return snapshot

    def _demo_enrich(self, snapshot: SearchSnapshot, selected: Dict[str, List[dict]]) -> None:
        for suite in selected.get("suite") or []:
            if suite.get("case_count") is None:
                key = f"{suite['project_id']}:{suite['id']}"
                suite["case_count"] = len(test_suite_repository.demo_suite_cases.get(key, set()))
        latest: Dict[str, dict] = {}
        for run in sorted(self.demo_runs, key=lambda r: r.get("started_at") or "", reverse=True):
            latest.setdefault(run.get("test_case_id"), run)
        for case in selected.get("test_case") or []:
            run = latest.get(case["id"])
            case["latest_status"] = (
                {"status": run.get("status"), "error_message": run.get("error_message")} if run else None
            )


search_repository = SearchRepository()
