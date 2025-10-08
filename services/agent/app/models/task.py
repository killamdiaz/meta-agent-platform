"""Task model for runtime updates."""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    task_type = Column(String, nullable=False)
    payload = Column(Text, nullable=True)
    status = Column(String, nullable=False)
    result = Column(Text, nullable=True)
    celery_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
