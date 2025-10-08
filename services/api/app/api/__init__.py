"""Expose the aggregated API router."""
from fastapi import APIRouter

from . import agents, tasks, memory

api_router = APIRouter(prefix="/api")
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(memory.router, prefix="/memory", tags=["memory"])

__all__ = ["api_router"]
