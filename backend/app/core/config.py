from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="AI-Powered Aspirant Intelligence Engine Backend", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    api_v1_prefix: str = Field(default="/api/v1", alias="API_V1_PREFIX")
    allowed_origins: str = Field(default="*", alias="ALLOWED_ORIGINS")

    mongodb_uri: str = Field(default="mongodb://localhost:27017", alias="MONGODB_URI")
    mongodb_db_name: str = Field(default="aspirant_intelligence_engine", alias="MONGODB_DB_NAME")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_embedding_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBEDDING_MODEL")

    news_api_url: str | None = Field(default=None, alias="NEWS_API_URL")
    news_api_key: str | None = Field(default=None, alias="NEWS_API_KEY")
    request_timeout_seconds: int = Field(default=30, alias="REQUEST_TIMEOUT_SECONDS")

    cache_backend: str = Field(default="memory", alias="CACHE_BACKEND")
    cache_default_ttl_seconds: int = Field(default=300, alias="CACHE_DEFAULT_TTL_SECONDS")
    cache_max_items: int = Field(default=2000, alias="CACHE_MAX_ITEMS")
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    redis_key_prefix: str = Field(default="aie:", alias="REDIS_KEY_PREFIX")

    cache_ttl_news_fetch_seconds: int = Field(default=120, alias="CACHE_TTL_NEWS_FETCH_SECONDS")
    cache_ttl_news_filter_seconds: int = Field(default=300, alias="CACHE_TTL_NEWS_FILTER_SECONDS")
    cache_ttl_news_pipeline_seconds: int = Field(default=180, alias="CACHE_TTL_NEWS_PIPELINE_SECONDS")
    cache_ttl_notes_seconds: int = Field(default=1800, alias="CACHE_TTL_NOTES_SECONDS")
    cache_ttl_quiz_seconds: int = Field(default=1800, alias="CACHE_TTL_QUIZ_SECONDS")
    cache_ttl_embedding_seconds: int = Field(default=86400, alias="CACHE_TTL_EMBEDDING_SECONDS")
    cache_ttl_classification_seconds: int = Field(default=1800, alias="CACHE_TTL_CLASSIFICATION_SECONDS")

    openai_source_max_chars: int = Field(default=2200, alias="OPENAI_SOURCE_MAX_CHARS")
    openai_classification_snippet_chars: int = Field(default=240, alias="OPENAI_CLASSIFICATION_SNIPPET_CHARS")
    openai_classification_max_tokens: int = Field(default=500, alias="OPENAI_CLASSIFICATION_MAX_TOKENS")
    openai_notes_max_tokens: int = Field(default=500, alias="OPENAI_NOTES_MAX_TOKENS")
    openai_quiz_max_tokens: int = Field(default=350, alias="OPENAI_QUIZ_MAX_TOKENS")

    static_gk_external_url: str | None = Field(default=None, alias="STATIC_GK_EXTERNAL_URL")
    static_gk_external_api_key: str | None = Field(default=None, alias="STATIC_GK_EXTERNAL_API_KEY")
    static_gk_external_auth_header: str = Field(default="Authorization", alias="STATIC_GK_EXTERNAL_AUTH_HEADER")
    static_gk_external_timeout_seconds: int = Field(default=20, alias="STATIC_GK_EXTERNAL_TIMEOUT_SECONDS")
    static_gk_external_verify_ssl: bool = Field(default=True, alias="STATIC_GK_EXTERNAL_VERIFY_SSL")

    @property
    def allowed_origins_list(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
