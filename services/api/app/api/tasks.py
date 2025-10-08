"""Task submission and status endpoints."""
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.db.session import get_session
from app.models.agent import Agent
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskRead

router = APIRouter()


@router.post("", response_model=TaskRead, status_code=status.HTTP_202_ACCEPTED)
async def submit_task(task: TaskCreate, session: AsyncSession = Depends(get_session)) -> TaskRead:
    agent = await session.get(Agent, task.agent_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    db_task = Task(
        agent_id=task.agent_id,
        task_type=task.task_type,
        payload=json.dumps(task.payload or {}),
        status="queued",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(db_task)
    await session.flush()

    celery_result = celery_app.send_task(
        "agent_runtime.execute_task",
        args=[
            {
                "task_id": db_task.id,
                "agent_id": task.agent_id,
                "task_type": task.task_type,
                "payload": task.payload or {},
            }
        ],
    )

    db_task.celery_id = celery_result.id
    await session.commit()
    await session.refresh(db_task)
    return TaskRead.model_validate(db_task)


@router.get("", response_model=dict)
async def list_tasks(session: AsyncSession = Depends(get_session)) -> dict:
    result = await session.execute(select(Task).order_by(Task.created_at.desc()).limit(20))
    tasks = result.scalars().all()
    return {"items": [TaskRead.model_validate(task).model_dump() for task in tasks]}


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: str, session: AsyncSession = Depends(get_session)) -> TaskRead:
    result = await session.execute(select(Task).where(Task.id == task_id))
    db_task = result.scalar_one_or_none()
    if not db_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return TaskRead.model_validate(db_task)
