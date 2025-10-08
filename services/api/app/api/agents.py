"""Agent CRUD endpoints."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentRead

router = APIRouter()


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(agent: AgentCreate, session: AsyncSession = Depends(get_session)) -> AgentRead:
    existing = await session.get(Agent, agent.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Agent already exists")

    db_agent = Agent(
        id=agent.id,
        owner_id=agent.owner_id,
        name=agent.name,
        role=agent.role,
        goals=agent.goals,
        tools=agent.tools,
        memory_scope=agent.memory_scope,
        state=agent.state,
        next_run_at=agent.next_run_at,
        last_updated=datetime.utcnow(),
        vector_id=agent.vector_id,
    )
    session.add(db_agent)
    await session.commit()
    await session.refresh(db_agent)
    return AgentRead.model_validate(db_agent)


@router.get("", response_model=dict)
async def list_agents(session: AsyncSession = Depends(get_session)) -> dict:
    result = await session.execute(select(Agent))
    agents = result.scalars().all()
    return {"items": [AgentRead.model_validate(agent).model_dump() for agent in agents]}


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: str, session: AsyncSession = Depends(get_session)) -> AgentRead:
    result = await session.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return AgentRead.model_validate(agent)
