from pydantic import BaseModel, Field, ConfigDict


DEFAULT_ENVIRONMENT_ID = "env-default"
DEFAULT_ENVIRONMENT_NAME = "Default"


class EnvironmentSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: str = Field(..., alias="projectId")
    name: str
    baseUrl: str = Field(..., alias="baseUrl")
    # The project's default environment. False for every row until the
    # 20261009_default_environment migration is applied; callers then fall back to the oldest.
    isDefault: bool = Field(False, alias="isDefault")


class CreateEnvironmentDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    baseUrl: str = Field(..., alias="baseUrl")


class UpdateEnvironmentDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str | None = None
    baseUrl: str | None = Field(None, alias="baseUrl")
