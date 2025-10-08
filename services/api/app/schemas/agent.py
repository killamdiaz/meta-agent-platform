"""Pydantic schemas for the Agent model."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AgentBase(BaseModel):
    owner_id: str
    name: str
    role: str
    goals: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    memory_scope: str = "global"
    state: Literal["idle", "active", "error"] = "idle"
    next_run_at: datetime | None = None
    vector_id: str | None = None


class AgentCreate(AgentBase):
    id: str


class AgentRead(AgentBase):
    id: str
    last_updated: datetime

    class Config:
        from_attributes = True
