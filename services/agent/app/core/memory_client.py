"""HTTP client for interacting with the memory service."""
from __future__ import annotations

import httpx

from app.settings import settings


async def add_memory(agent_id: str, text: str, metadata: dict | None = None) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.memory_service_url}/memory/add",
            json={"agent_id": agent_id, "text": text, "metadata": metadata},
            timeout=10.0,
        )
