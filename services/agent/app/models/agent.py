"""Agent model definition for runtime service."""
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, String, Text
from sqlalchemy.dialects.postgresql import ARRAY

from app.core.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True)
    owner_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(Text, nullable=False)
    goals = Column(ARRAY(String), nullable=False)
    tools = Column(ARRAY(String), nullable=False)
    memory_scope = Column(String, nullable=False)
    state = Column(Enum("idle", "active", "error", name="agent_state"), nullable=False)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    last_updated = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    vector_id = Column(String, nullable=True)
