"""Celery worker that executes agent tasks."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime

import structlog
from celery import Celery
from sqlalchemy import update

from app.core.agents import OutreachAgent
from app.core.database import async_session_factory
from app.models import Agent, Task
from app.settings import settings

logger = structlog.get_logger(__name__)

celery_app = Celery(
    "agent_runtime",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"], timezone="UTC")


async def _execute(payload: dict) -> str:
    task_id: str = payload["task_id"]
    agent_id: str = payload["agent_id"]
    task_payload = payload.get("payload", {})

    async with async_session_factory() as session:
        agent = await session.get(Agent, agent_id)
        if not agent:
            raise RuntimeError(f"Agent {agent_id} not found")

        db_task = await session.get(Task, task_id)
        if not db_task:
            raise RuntimeError(f"Task {task_id} not found")

        db_task.status = "running"
        db_task.updated_at = datetime.utcnow()
        agent.state = "active"
        await session.commit()
        agent_name = agent.name

    outreach = OutreachAgent(agent_id=agent_id, name=agent_name)
    result_message = await outreach.run(task_payload)

    async with async_session_factory() as session:
        await session.execute(
            update(Task)
            .where(Task.id == task_id)
            .values(status="completed", result=json.dumps({"message": result_message}), updated_at=datetime.utcnow())
        )
        await session.execute(
            update(Agent)
            .where(Agent.id == agent_id)
            .values(state="idle", last_updated=datetime.utcnow())
        )
        await session.commit()

    return result_message


@celery_app.task(name="agent_runtime.execute_task")
def execute_task(payload: dict) -> str:
    logger.info("execute_task.start", payload=payload)
    result = asyncio.run(_execute(payload))
    logger.info("execute_task.done", task_id=payload.get("task_id"))
    return result
