"""SQLAlchemy model definitions for agents."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy import Column, DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import ARRAY

from app.db.session import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True)
    owner_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(Text, nullable=False)
    goals = Column(ARRAY(String), nullable=False, default=list)
    tools = Column(ARRAY(String), nullable=False, default=list)
    memory_scope = Column(String, nullable=False, default="global")
    state = Column(Enum("idle", "active", "error", name="agent_state"), nullable=False, default="idle")
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    last_updated = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    vector_id = Column(String, nullable=True)

    def to_state(self) -> Literal["idle", "active", "error"]:
        return self.state  # type: ignore[return-value]
