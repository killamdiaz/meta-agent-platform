"""Pydantic schemas for task submission and status."""
from datetime import datetime
import json

from pydantic import BaseModel, field_validator


class TaskCreate(BaseModel):
    agent_id: str
    task_type: str
    payload: dict | None = None


class TaskRead(BaseModel):
    id: str
    agent_id: str
    task_type: str
    status: str
    result: dict | str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("result", mode="before")
    @classmethod
    def deserialize_result(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return value

    class Config:
        from_attributes = True
