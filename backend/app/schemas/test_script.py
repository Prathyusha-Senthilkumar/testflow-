from pydantic import BaseModel, Field, ConfigDict


class TestScriptDto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str = Field(..., min_length=1)


class TestScriptResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    content: str
    testFile: str = Field(..., alias="testFile")
