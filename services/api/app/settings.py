"""Application settings loaded from environment variables."""
from functools import lru_cache

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    sync_database_url: str
    redis_url: str
    openai_api_key: str
    memory_service_url: AnyHttpUrl

    service_name: str = "api-gateway"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
