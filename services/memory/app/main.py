"""FastAPI application for the Cortex Runtime memory service."""
from __future__ import annotations

import structlog
from fastapi import FastAPI

from app.api.routes import router
from app.settings import settings

logger = structlog.get_logger(__name__)

app = FastAPI(title="Cortex Memory Service", version="0.1.0")
app.include_router(router)


@app.get("/healthz", include_in_schema=False)
async def healthcheck() -> dict:
    logger.info("healthcheck", service=settings.service_name)
    return {"status": "ok", "service": settings.service_name}
