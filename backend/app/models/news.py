from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class NewsArticleModel(BaseModel):
    title: str
    description: str | None = None
    content: str | None = None
    source: str
    url: str | None = None
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tags: list[str] = Field(default_factory=list)

    def to_mongo(self) -> dict[str, Any]:
        return self.model_dump()


class TrustScoreModel(BaseModel):
    article: NewsArticleModel
    trust_score: float
    trust_level: str
    factors: dict[str, float]


class NotesModel(BaseModel):
    article_title: str
    notes: str
    key_points: list[str]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class QuizQuestionModel(BaseModel):
    question: str
    options: list[str]
    answer: str
    explanation: str
