from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.news import NewsArticle


class GenerateNotesRequest(BaseModel):
    article: NewsArticle
    exam_context: str | None = Field(default="UPSC CSE")


class GenerateNotesResponse(BaseModel):
    notes: str
    key_points: list[str]
    generated_by: str


class QuizQuestion(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    answer: str
    explanation: str


class GenerateQuizRequest(BaseModel):
    article: NewsArticle
    num_questions: int = Field(default=1, ge=1, le=1)


class GenerateQuizResponse(BaseModel):
    questions: list[QuizQuestion]
    generated_by: str


class GKFact(BaseModel):
    key: str
    value: str


class GKTopicMatch(BaseModel):
    topic_id: str
    topic_name: str
    category: str
    confidence: float
    match_method: Literal["keyword", "keyword+embedding"]
    matched_keywords: list[str]
    facts: list[GKFact]


class LinkStaticGKRequest(BaseModel):
    article: NewsArticle
    top_k: int = Field(default=3, ge=1, le=10)
    min_score: float = Field(default=0.2, ge=0.0, le=1.0)
    use_embeddings: bool = False
    dataset_source: Literal["auto", "json", "mongo", "external", "merged"] = "auto"
    persist_result: bool = True


class LinkStaticGKResponse(BaseModel):
    topic_matches: list[GKTopicMatch]
    total_matches: int
    used_embeddings: bool
    dataset_source: Literal["json", "mongo", "external", "merged"]


class SyncStaticGKResponse(BaseModel):
    upserted_count: int
    source: str
