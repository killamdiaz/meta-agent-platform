"""FastAPI application entry point for the Cortex Runtime API gateway."""
from __future__ import annotations

import time

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import Counter, Histogram, generate_latest

from app.api import api_router
from app.settings import settings

logger = structlog.get_logger(__name__)

REQUEST_COUNT = Counter("api_requests_total", "Total number of API requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("api_request_latency_seconds", "Latency of API requests", ["endpoint"])

app = FastAPI(title="Cortex Runtime API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):  # type: ignore[override]
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    endpoint = request.url.path
    REQUEST_LATENCY.labels(endpoint=endpoint).observe(elapsed)
    REQUEST_COUNT.labels(method=request.method, endpoint=endpoint, status=response.status_code).inc()
    return response


@app.get("/healthz", include_in_schema=False)
async def healthcheck() -> dict:
    return {"status": "ok", "service": settings.service_name}


@app.get("/metrics", include_in_schema=False)
async def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest().decode("utf-8"), media_type="text/plain")


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception", error=str(exc))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
