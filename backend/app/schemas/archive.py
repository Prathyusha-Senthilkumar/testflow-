from pydantic import BaseModel, ConfigDict


class ArchiveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    archived: bool
