"""Proxy endpoints to the memory service."""
import httpx
from fastapi import APIRouter, HTTPException, status

from app.schemas.memory import MemoryAddRequest, MemoryQueryRequest
from app.settings import settings

router = APIRouter()


@router.post("/add", status_code=status.HTTP_202_ACCEPTED)
async def add_memory(payload: MemoryAddRequest) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{settings.memory_service_url}/memory/add", json=payload.model_dump())
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


@router.post("/query")
async def query_memory(payload: MemoryQueryRequest) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{settings.memory_service_url}/memory/query", json=payload.model_dump())
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()
