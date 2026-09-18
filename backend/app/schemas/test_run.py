from typing import Optional, Literal
from pydantic import BaseModel


class TestRunResult(BaseModel):
    status: Literal["Passed", "Failed"]
    duration: float
    error: Optional[str] = None
