"""Task tracking for Celery jobs."""
from datetime import datetime
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    task_type = Column(String, nullable=False)
    payload = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="queued")
    result = Column(Text, nullable=True)
    celery_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    agent = relationship("Agent", backref="tasks")
