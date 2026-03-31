from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


class NewsArticle(BaseModel):
    title: str
    description: str | None = None
    content: str | None = None
    source: str
    url: str | None = None
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    supporting_sources: list[str] = Field(default_factory=list)


class FetchNewsRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=100)
    limit: int = Field(default=10, ge=1, le=50)


class FetchNewsResponse(BaseModel):
    items: list[NewsArticle]
    total: int


class RunPipelineRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=100)
    limit: int = Field(default=10, ge=1, le=50)
    keywords: list[str] = Field(default_factory=list)
    excluded_keywords: list[str] = Field(default_factory=list)
    max_llm_batch_size: int = Field(default=20, ge=5, le=50)
    use_llm: bool = True


class FilterNewsRequest(BaseModel):
    items: list[NewsArticle]
    keywords: list[str] = Field(default_factory=list)
    excluded_keywords: list[str] = Field(default_factory=list)
    max_llm_batch_size: int = Field(default=20, ge=5, le=50)
    use_llm: bool = True


class KeywordFilterMeta(BaseModel):
    include_hits: list[str]
    exclude_hits: list[str]
    keyword_score: float
    stage1_passed: bool


class LLMClassificationMeta(BaseModel):
    label: Literal["relevant", "irrelevant"]
    confidence: float = Field(ge=0, le=1)
    reason: str
    model: str
    fallback_used: bool = False


class RankingMeta(BaseModel):
    rank_score: float
    rank_position: int | None = None
    source_reputation: float
    recency_score: float
    content_quality: float
    keyword_score: float
    llm_confidence: float


class FilteredNewsItem(BaseModel):
    article: NewsArticle
    keyword_filter: KeywordFilterMeta
    classification: LLMClassificationMeta
    ranking: RankingMeta


class FilterNewsResponse(BaseModel):
    ranked_items: list[FilteredNewsItem]
    total_input: int
    stage1_passed: int
    stage2_relevant: int
    total_ranked: int


class TrustScoreFactors(BaseModel):
    primary_source: str
    primary_source_reliability: float
    source_reliability_map: dict[str, float]
    trusted_source_count: int
    cross_verified_sources: list[str]
    verification_rule: str
    dynamic_updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrustScoreItem(BaseModel):
    article: NewsArticle
    trust_score: float
    trust_level: str
    factors: TrustScoreFactors
    confidence_note: str
    version: int = 1


class TrustScoreRequest(BaseModel):
    items: list[NewsArticle]


class TrustScoreResponse(BaseModel):
    items: list[TrustScoreItem]
    total: int


class RunPipelineResponse(BaseModel):
    items: list[TrustScoreItem]
    total: int
    total_fetched: int
    total_filtered: int
    processing_ms: int
    cache_hit: bool = False
