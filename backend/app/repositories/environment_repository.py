import time
from typing import Dict, List

from fastapi import HTTPException

from app.database import get_supabase_client
from app.schemas.environment import (
    DEFAULT_ENVIRONMENT_ID,
    DEFAULT_ENVIRONMENT_NAME,
    EnvironmentSummary,
    CreateEnvironmentDto,
    UpdateEnvironmentDto,
)


class EnvironmentRepository:
    def __init__(self):
        self.demo_environments: Dict[str, List[EnvironmentSummary]] = {
            "demo-project": [
                EnvironmentSummary(
                    id=DEFAULT_ENVIRONMENT_ID,
                    projectId="demo-project",
                    name=DEFAULT_ENVIRONMENT_NAME,
                    baseUrl="https://www.srmist.edu.in/",
                )
            ]
        }

    @property
    def db(self):
        return get_supabase_client()

    def list_by_project(self, project_id: str) -> List[EnvironmentSummary]:
        if not self.db:
            self.ensure_default(project_id, None)
            return list(self.demo_environments.get(project_id, []))

        raise HTTPException(status_code=501, detail="Environments require demo mode in Phase 1")

    def find_by_id(self, project_id: str, environment_id: str) -> EnvironmentSummary:
        if not self.db:
            self.ensure_default(project_id, None)
            for env in self.demo_environments.get(project_id, []):
                if env.id == environment_id:
                    return env
            raise HTTPException(status_code=404, detail="Environment not found")

        raise HTTPException(status_code=501, detail="Environments require demo mode in Phase 1")

    def get_default(self, project_id: str, fallback_base_url: str | None = None) -> EnvironmentSummary:
        self.ensure_default(project_id, fallback_base_url)
        environments = self.demo_environments.get(project_id, [])
        for env in environments:
            if env.id == DEFAULT_ENVIRONMENT_ID:
                return env
        if environments:
            return environments[0]
        raise HTTPException(status_code=404, detail="No environment configured for project")

    def ensure_default(self, project_id: str, base_url: str | None) -> EnvironmentSummary:
        if not self.db:
            existing = self.demo_environments.get(project_id, [])
            for env in existing:
                if env.id == DEFAULT_ENVIRONMENT_ID:
                    if base_url and env.baseUrl != base_url:
                        updated = env.model_copy(update={"baseUrl": base_url})
                        self._replace(project_id, env.id, updated)
                        return updated
                    return env
            resolved_base = base_url or "https://example.com"
            default_env = EnvironmentSummary(
                id=DEFAULT_ENVIRONMENT_ID,
                projectId=project_id,
                name=DEFAULT_ENVIRONMENT_NAME,
                baseUrl=resolved_base,
            )
            self.demo_environments.setdefault(project_id, []).insert(0, default_env)
            return default_env
        raise HTTPException(status_code=501, detail="Environments require demo mode in Phase 1")

    def create(self, project_id: str, input_dto: CreateEnvironmentDto) -> EnvironmentSummary:
        if not self.db:
            self.ensure_default(project_id, None)
            new_id = f"env-{int(time.time() * 1000)}"
            env = EnvironmentSummary(
                id=new_id,
                projectId=project_id,
                name=input_dto.name.strip(),
                baseUrl=input_dto.baseUrl,
            )
            self.demo_environments.setdefault(project_id, []).append(env)
            return env
        raise HTTPException(status_code=501, detail="Environments require demo mode in Phase 1")

    def update(
        self, project_id: str, environment_id: str, input_dto: UpdateEnvironmentDto
    ) -> EnvironmentSummary:
        if not self.db:
            current = self.find_by_id(project_id, environment_id)
            updates: dict = {}
            if input_dto.name is not None:
                updates["name"] = input_dto.name
            if input_dto.baseUrl is not None:
                updates["baseUrl"] = input_dto.baseUrl
            updated = current.model_copy(update=updates)
            self._replace(project_id, environment_id, updated)
            return updated
        raise HTTPException(status_code=501, detail="Environments require demo mode in Phase 1")

    def delete(self, project_id: str, environment_id: str) -> None:
        if not self.db:
            if environment_id == DEFAULT_ENVIRONMENT_ID:
                raise HTTPException(status_code=400, detail="The Default environment cannot be deleted")
            environments = self.demo_environments.get(project_id, [])
            next_list = [env for env in environments if env.id != environment_id]
            if len(next_list) == len(environments):
                raise HTTPException(status_code=404, detail="Environment not found")
            self.demo_environments[project_id] = next_list
            return
        raise HTTPException(status_code=501, detail="Environments require demo mode in Phase 1")

    def _replace(self, project_id: str, environment_id: str, updated: EnvironmentSummary) -> None:
        environments = self.demo_environments.get(project_id, [])
        for index, env in enumerate(environments):
            if env.id == environment_id:
                environments[index] = updated
                return
        raise HTTPException(status_code=404, detail="Environment not found")


environment_repository = EnvironmentRepository()
