"""Schemas for interacting with the memory service."""
from pydantic import BaseModel


class MemoryAddRequest(BaseModel):
    agent_id: str
    text: str
    metadata: dict | None = None


class MemoryQueryRequest(BaseModel):
    agent_id: str
    query_text: str
    top_k: int = 5
