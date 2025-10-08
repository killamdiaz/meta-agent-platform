"""Agent implementations."""
from __future__ import annotations

import asyncio

import structlog

from app.core.memory_client import add_memory

logger = structlog.get_logger(__name__)


class OutreachAgent:
    """Demo agent that logs and stores a greeting."""

    def __init__(self, agent_id: str, name: str) -> None:
        self.agent_id = agent_id
        self.name = name

    async def run(self, payload: dict) -> str:
        message = payload.get("message") or f"Hello, world from {self.name}!"
        logger.info("outreach_agent.run", agent_id=self.agent_id, message=message)
        await add_memory(self.agent_id, message, metadata={"source": "OutreachAgent"})
        await asyncio.sleep(0.1)
        return message
