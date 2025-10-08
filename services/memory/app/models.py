"""Database models for the memory service."""
from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import VECTOR

from app.core.database import Base


class MemoryVector(Base):
    __tablename__ = "memory_vectors"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    text = Column(String, nullable=False)
    metadata = Column(JSON, nullable=True)
    embedding = Column(VECTOR(1536))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
