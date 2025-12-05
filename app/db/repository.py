import uuid
from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import Message, SessionLocal


async def save_message(session: AsyncSession, conversation_id: str, role: str, content: str) -> str:
    message_id = str(uuid.uuid4())
    msg = Message(id=message_id, conversation_id=conversation_id, role=role, content=content)
    session.add(msg)
    await session.commit()
    return message_id


async def get_history(session: AsyncSession, conversation_id: str) -> List[Message]:
    result = await session.execute(select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at))
    return list(result.scalars().all())


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
