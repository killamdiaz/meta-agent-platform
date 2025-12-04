from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

Base = declarative_base()


class Message(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True)
    conversation_id = Column(String, index=True)
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_async_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
