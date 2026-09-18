from pydantic import BaseModel, Field, ConfigDict


DEFAULT_ENVIRONMENT_ID = "env-default"
DEFAULT_ENVIRONMENT_NAME = "Default"


class EnvironmentSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: str = Field(..., alias="projectId")
    name: str
    baseUrl: str = Field(..., alias="baseUrl")


class CreateEnvironmentDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    baseUrl: str = Field(..., alias="baseUrl")


class UpdateEnvironmentDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str | None = None
    baseUrl: str | None = Field(None, alias="baseUrl")
