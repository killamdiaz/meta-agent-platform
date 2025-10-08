"""FastAPI routes for memory operations."""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import MemoryAddRequest, MemoryQueryRequest
from app.core.database import get_session
from app.core.embeddings import EMBEDDING_DIM, cosine_similarity, text_to_embedding
from app.models import MemoryVector

router = APIRouter(prefix="/memory")


@router.post("/add")
async def add_memory(payload: MemoryAddRequest, session: AsyncSession = Depends(get_session)) -> dict:
    embedding = text_to_embedding(payload.text)

    memory = MemoryVector(
        agent_id=payload.agent_id,
        text=payload.text,
        metadata=payload.metadata,
        embedding=embedding,
    )
    session.add(memory)
    await session.commit()
    await session.refresh(memory)

    return {"id": memory.id, "agent_id": memory.agent_id}


@router.post("/query")
async def query_memory(payload: MemoryQueryRequest, session: AsyncSession = Depends(get_session)) -> dict:
    query_vector = np.array(text_to_embedding(payload.query_text))

    result = await session.execute(select(MemoryVector).where(MemoryVector.agent_id == payload.agent_id))
    memories = result.scalars().all()
    if not memories:
        return {"matches": []}

    matches: list[tuple[float, MemoryVector]] = []
    for memory in memories:
        memory_vector = np.array(memory.embedding or [0.0] * EMBEDDING_DIM)
        score = cosine_similarity(query_vector, memory_vector)
        matches.append((score, memory))

    matches.sort(key=lambda item: item[0], reverse=True)
    top_matches = [
        {
            "id": memory.id,
            "text": memory.text,
            "metadata": memory.metadata,
            "score": float(score),
        }
        for score, memory in matches[: payload.top_k]
    ]

    return {"matches": top_matches}
