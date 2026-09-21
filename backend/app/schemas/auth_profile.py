from pydantic import BaseModel, Field, ConfigDict


class AuthProfileSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    projectId: str = Field(..., alias="projectId")
    name: str
    loginUrl: str = Field(..., alias="loginUrl")
    hasStorageState: bool = Field(..., alias="hasStorageState")
    createdAt: str = Field(..., alias="createdAt")


class CreateAuthProfileDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    name: str
    loginUrl: str | None = Field(default=None, alias="loginUrl")
