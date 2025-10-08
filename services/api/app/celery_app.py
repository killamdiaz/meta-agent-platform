"""Celery client configuration for publishing tasks from the API."""
from celery import Celery

from app.settings import settings

celery_app = Celery(
    "cortex_api",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"], timezone="UTC")
