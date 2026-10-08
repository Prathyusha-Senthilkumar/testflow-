import logging
import sys
from pathlib import Path
from typing import List

from fastapi import HTTPException

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from app.repositories.environment_repository import (
    DefaultColumnMissing,
    EnvironmentRepository,
    environment_repository,
)
from app.repositories.project_repository import ProjectRepository
from app.schemas.environment import (
    CreateEnvironmentDto,
    EnvironmentSummary,
    UpdateEnvironmentDto,
)
from app.utils.http_url import normalize_base_url

_logger = logging.getLogger("testflow.environments")

DEFAULT_MIGRATION_MESSAGE = (
    "Default environments need a database update. "
    "Apply supabase/migrations/20261009_default_environment.sql and try again."
)


def pick_default(environments: List[EnvironmentSummary]) -> EnvironmentSummary | None:
    """The flagged default, else the oldest (lists are ordered oldest first)."""
    for env in environments:
        if env.isDefault:
            return env
    return environments[0] if environments else None


class EnvironmentsService:
    def __init__(
        self,
        environment_repository: EnvironmentRepository,
        project_repository: ProjectRepository,
    ):
        self.environments = environment_repository
        self.projects = project_repository

    def list_for_project(self, project_id: str) -> List[EnvironmentSummary]:
        project = self.projects.find_base(project_id)
        self.environments.ensure_default(project_id, project.baseUrl)
        return self.environments.list_by_project(project_id)

    def create(self, project_id: str, input_dto: CreateEnvironmentDto) -> EnvironmentSummary:
        self.projects.find_base(project_id)
        name = (input_dto.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Environment name is required")
        base_url = normalize_base_url(input_dto.baseUrl)
        created = self.environments.create(
            project_id, CreateEnvironmentDto(name=name, baseUrl=base_url)
        )
        # The first environment of a project becomes its default.
        flagged = self.ensure_default_flag(project_id)
        if flagged is not None and flagged.id == created.id:
            return flagged
        return created

    def update(
        self, project_id: str, environment_id: str, input_dto: UpdateEnvironmentDto
    ) -> EnvironmentSummary:
        self.projects.find_base(project_id)
        name = input_dto.name
        base_url = input_dto.baseUrl
        if name is not None:
            name = name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Environment name is required")
        if base_url is not None:
            base_url = normalize_base_url(base_url)
        return self.environments.update(
            project_id,
            environment_id,
            UpdateEnvironmentDto(name=name, baseUrl=base_url),
        )

    def delete(self, project_id: str, environment_id: str) -> None:
        self.projects.find_base(project_id)
        was_default = self.environments.find_by_id(project_id, environment_id).isDefault
        self.environments.delete(project_id, environment_id)
        if was_default:
            # Deleting the default promotes the oldest remaining environment.
            self.ensure_default_flag(project_id)

    def default_environment(self, project_id: str) -> EnvironmentSummary:
        """The project's default environment: the flagged one, else the oldest."""
        found = pick_default(self.list_for_project(project_id))
        if found is None:
            raise HTTPException(status_code=404, detail="No environment configured for project")
        return found

    def set_default(self, project_id: str, environment_id: str) -> List[EnvironmentSummary]:
        self.projects.find_base(project_id)
        self.environments.find_by_id(project_id, environment_id)
        try:
            self.environments.set_default_flag(project_id, environment_id)
        except DefaultColumnMissing as exc:
            raise HTTPException(status_code=409, detail=DEFAULT_MIGRATION_MESSAGE) from exc
        _logger.info(
            "event=environment_default_set project_id=%s environment_id=%s", project_id, environment_id
        )
        return self.environments.list_by_project(project_id)

    def ensure_default_flag(self, project_id: str) -> EnvironmentSummary | None:
        """Flag the oldest environment when none is flagged. Returns the flagged one, if any."""
        environments = self.environments.list_by_project(project_id)
        if not environments or any(env.isDefault for env in environments):
            return None
        oldest = environments[0]
        try:
            self.environments.set_default_flag(project_id, oldest.id)
        except DefaultColumnMissing:
            # Not migrated yet: reads already treat the oldest as the default.
            return None
        return oldest.model_copy(update={"isDefault": True})

    def resolve_start_url(self, project_id: str, start_path: str, environment_id: str | None) -> str:
        from automation.framework.url_resolve import resolve_start_url

        project = self.projects.find_base(project_id)
        if environment_id:
            env = self.environments.find_by_id(project_id, environment_id)
            base_url = env.baseUrl
        else:
            env = self.environments.get_default(project_id, project.baseUrl)
            base_url = env.baseUrl
        return resolve_start_url(base_url, start_path)
