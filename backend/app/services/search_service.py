"""Global search: validates the query, ranks candidates and shapes result groups."""

import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.repositories.search_repository import (
    RUN_STATUS_KEYWORDS,
    CandidateSet,
    SearchRepository,
    SearchSnapshot,
)
from app.schemas.search import (
    MIN_QUERY_LENGTH,
    SEARCH_LABELS,
    SEARCH_TYPES,
    SearchGroup,
    SearchItem,
    SearchResponse,
)

logger = logging.getLogger("testflow.search")

QUERY_TOO_SHORT = "Type at least 2 characters to search."

# Fields matched per type, in the order they are tried.
_MATCH_FIELDS: Dict[str, Tuple[str, ...]] = {
    "project": ("name", "base_url"),
    "suite": ("name",),
    "test_case": ("name", "code"),
    "run": ("case_name", "case_code"),
}

_STATUS_LABELS = {
    "queued": "Queued",
    "running": "Running",
    "passed": "Passed",
    "failed": "Failed",
    "cancelled": "Cancelled",
    "not_run": "Not run",
}


def match_score(needle: str, values: List[Optional[str]]) -> Optional[int]:
    """0 = exact, 1 = prefix, 2 = contains, None = no match (case-insensitive)."""
    best: Optional[int] = None
    for value in values:
        text = (value or "").lower()
        if not text or needle not in text:
            continue
        score = 0 if text == needle else 1 if text.startswith(needle) else 2
        best = score if best is None else min(best, score)
    return best


def normalize_run_status(status: Optional[str], error_message: Optional[str] = None) -> Optional[str]:
    if not status:
        return None
    value = status.strip().lower().replace(" ", "_")
    # Cancels are stored as "Not Run" with error_message "Cancelled".
    if value == "not_run" and (error_message or "").strip().lower() == "cancelled":
        return "cancelled"
    return value


def format_run_time(value: Optional[str]) -> Optional[str]:
    """ISO timestamp -> '2 Oct 14:03' (UTC, as stored)."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return f"{parsed.day} {parsed.strftime('%b %H:%M')}"


def _join(*parts: Optional[str]) -> Optional[str]:
    text = " · ".join(p for p in parts if p)
    return text or None


class SearchService:
    def __init__(self, repository: SearchRepository):
        self.repository = repository

    def search(
        self, query: str, scope: str, limit: int, project_id: Optional[str]
    ) -> SearchResponse:
        text = (query or "").strip()
        if len(text) < MIN_QUERY_LENGTH:
            raise HTTPException(status_code=400, detail=QUERY_TOO_SHORT)
        project_id = (project_id or "").strip() or None
        types = list(SEARCH_TYPES) if scope == "all" else [scope]
        needle = text.lower()
        run_statuses = self._run_statuses(needle)

        started = time.perf_counter()
        snapshot = self.repository.find_candidates(text, types, project_id, run_statuses)

        ranked: Dict[str, Tuple[int, List[dict]]] = {}
        for kind in types:
            total, rows = self._rank(kind, needle, snapshot.groups.get(kind) or CandidateSet(), run_statuses)
            ranked[kind] = (total, rows[:limit])

        self.repository.enrich(snapshot, {kind: rows for kind, (_, rows) in ranked.items()})

        groups: List[SearchGroup] = []
        for kind in types:
            total, rows = ranked[kind]
            if scope == "all" and not rows:
                continue
            groups.append(
                SearchGroup(
                    type=kind,
                    label=SEARCH_LABELS[kind],
                    total=total,
                    items=[self._item(kind, row, snapshot) for row in rows],
                )
            )
        logger.info(
            "event=search_completed scope=%s query_length=%d project_scoped=%s groups=%d duration_ms=%d",
            scope, len(text), bool(project_id), len(groups), int((time.perf_counter() - started) * 1000),
        )
        return SearchResponse(query=text, type=scope, groups=groups)

    # ---- ranking ----------------------------------------------------------
    @staticmethod
    def _run_statuses(needle: str) -> List[str]:
        # "fail", "failed" -> Failed. Three characters avoid matching every run on "ru"/"pa".
        if len(needle) < 3:
            return []
        return [status for keyword, status in RUN_STATUS_KEYWORDS.items() if keyword.startswith(needle)]

    @staticmethod
    def _rank(
        kind: str, needle: str, candidates: CandidateSet, run_statuses: List[str]
    ) -> Tuple[int, List[dict]]:
        fields = _MATCH_FIELDS[kind]
        scored: List[Tuple[int, dict]] = []
        for row in candidates.rows:
            score = match_score(needle, [row.get(f) for f in fields])
            if score is None and kind == "run" and row.get("status") in run_statuses:
                score = 3
            if score is not None:
                scored.append((score, row))
        dropped = len(candidates.rows) - len(scored)
        total = max(candidates.total - dropped, len(scored))

        # Most recent first, then stable sort by match quality (runs: recency only).
        scored.sort(key=lambda item: (item[1].get("updated_at") is not None, item[1].get("updated_at") or ""), reverse=True)
        if kind == "run":
            scored.sort(key=lambda item: item[1].get("started_at") or "", reverse=True)
        else:
            scored.sort(key=lambda item: item[0])
        return total, [row for _, row in scored]

    # ---- display ----------------------------------------------------------
    @staticmethod
    def _item(kind: str, row: dict, snapshot: SearchSnapshot) -> SearchItem:
        suite = snapshot.suites.get(row.get("suite_id") or "") or {}
        project_id = row.get("project_id") or suite.get("project_id") or None
        if kind == "project":
            project_id = row["id"]
        project_name = row.get("name") if kind == "project" else snapshot.project_names.get(project_id or "")

        if kind == "project":
            return SearchItem(
                id=row["id"], type=kind, title=row.get("name") or "Untitled",
                subtitle=row.get("base_url") or None, projectId=project_id,
                projectName=project_name, updatedAt=row.get("updated_at"),
            )
        if kind == "suite":
            count = row.get("case_count")
            count_text = None if count is None else f"{count} case" + ("" if count == 1 else "s")
            return SearchItem(
                id=row["id"], type=kind, title=row.get("name") or "Untitled",
                subtitle=_join(project_name, count_text), projectId=project_id,
                projectName=project_name, updatedAt=row.get("updated_at"),
            )
        if kind == "test_case":
            latest = row.get("latest_status") or {}
            return SearchItem(
                id=row["id"], type=kind, title=row.get("name") or "Untitled",
                subtitle=_join(row.get("code"), suite.get("name"), project_name),
                projectId=project_id, projectName=project_name,
                status=normalize_run_status(latest.get("status"), latest.get("error_message")),
                updatedAt=row.get("updated_at"),
            )
        status = normalize_run_status(row.get("status"), row.get("error_message"))
        return SearchItem(
            id=row["id"], type=kind,
            title=row.get("case_name") or row.get("case_code") or "Deleted test case",
            subtitle=_join(
                _STATUS_LABELS.get(status or "", (status or "").replace("_", " ").title() or None),
                format_run_time(row.get("started_at")),
                project_name,
            ),
            projectId=project_id, projectName=project_name, status=status,
            updatedAt=row.get("updated_at"), testCaseId=row.get("test_case_id"),
        )
