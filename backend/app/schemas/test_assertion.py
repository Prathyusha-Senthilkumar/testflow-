from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

AssertionType = Literal["url_contains", "text_visible", "page_title_contains"]


class AssertionConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    type: AssertionType
    value: str

    @field_validator("value")
    @classmethod
    def value_not_empty(cls, v: str) -> str:
        if not (v or "").strip():
            raise ValueError("Assertion expected value is required")
        return v.strip()
