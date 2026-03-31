import logging
import re

from app.core.cache import cache_service, make_cache_key
from app.core.config import settings
from app.core.database import get_database
from app.core.exceptions import AppException
from app.schemas.content import QuizQuestion
from app.schemas.news import NewsArticle
from app.services.ai_service import openai_service

logger = logging.getLogger(__name__)


class ContentService:
    async def generate_notes(self, article: NewsArticle, exam_context: str | None) -> tuple[str, list[str], str]:
        cache_key = make_cache_key(
            "content:notes",
            {
                "article": article.model_dump(mode="json"),
                "exam_context": exam_context or "",
                "model": settings.openai_model,
            },
        )

        async def producer() -> dict:
            notes, key_points, generated_by = await openai_service.generate_notes(article, exam_context)
            return {
                "notes": notes,
                "key_points": key_points,
                "generated_by": generated_by,
            }

        cached_payload, cache_hit = await cache_service.get_or_set_json(
            cache_key,
            ttl_seconds=settings.cache_ttl_notes_seconds,
            producer=producer,
        )
        if not isinstance(cached_payload, dict):
            cached_payload = {}
        notes = str(cached_payload.get("notes", ""))
        key_points = [str(item) for item in cached_payload.get("key_points", [])]
        generated_by = str(cached_payload.get("generated_by", "fallback-extractive"))
        if cache_hit:
            generated_by = f"{generated_by}+cache"
        else:
            await self._store_notes(article.title, notes, key_points, generated_by)
        return notes, key_points, generated_by

    async def generate_quiz(self, article: NewsArticle, num_questions: int) -> tuple[list[QuizQuestion], str]:
        cache_key = make_cache_key(
            "content:quiz",
            {
                "article": article.model_dump(mode="json"),
                "num_questions": num_questions,
                "model": settings.openai_model,
            },
        )

        async def producer() -> dict:
            questions, generated_by = await openai_service.generate_quiz(article, num_questions)
            return {
                "questions": [question.model_dump(mode="json") for question in questions],
                "generated_by": generated_by,
            }

        cached_payload, cache_hit = await cache_service.get_or_set_json(
            cache_key,
            ttl_seconds=settings.cache_ttl_quiz_seconds,
            producer=producer,
        )
        if not isinstance(cached_payload, dict):
            cached_payload = {}
        question_payloads = cached_payload.get("questions", [])
        questions = [
            QuizQuestion.model_validate(self._normalize_quiz_payload(item))
            for item in question_payloads
            if isinstance(item, dict)
        ]
        generated_by = str(cached_payload.get("generated_by", "fallback-extractive"))
        if cache_hit:
            generated_by = f"{generated_by}+cache"
        else:
            await self._store_quiz(article.title, questions, generated_by)
        return questions, generated_by

    def _normalize_quiz_payload(self, payload: dict) -> dict:
        options = payload.get("options", [])
        if not isinstance(options, list):
            options = []

        cleaned_options = [self._sanitize_quiz_text(str(option)) for option in options]
        answer = self._sanitize_quiz_text(str(payload.get("answer", "")))
        if answer and answer not in cleaned_options and cleaned_options:
            # Keep answer aligned with options for older cached payloads.
            answer = cleaned_options[0]

        return {
            **payload,
            "options": cleaned_options,
            "answer": answer,
            "explanation": str(payload.get("explanation", "")),
        }

    def _sanitize_quiz_text(self, text: str) -> str:
        cleaned = str(text or "")
        cleaned = re.sub(r"\bTitle:\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bDescription:\s*", " ", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bContent:\s*", " ", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bSource:\s*", " ", cleaned, flags=re.IGNORECASE)
        return " ".join(cleaned.split())

    async def _store_notes(
        self,
        article_title: str,
        notes: str,
        key_points: list[str],
        generated_by: str,
    ) -> None:
        try:
            db = get_database()
            await db["generated_notes"].insert_one(
                {
                    "article_title": article_title,
                    "notes": notes,
                    "key_points": key_points,
                    "generated_by": generated_by,
                }
            )
        except Exception as exc:
            logger.exception("Failed to store generated notes: %s", exc)
            raise AppException(status_code=500, message="Failed to save generated notes", details=str(exc)) from exc

    async def _store_quiz(self, article_title: str, questions: list[QuizQuestion], generated_by: str) -> None:
        try:
            db = get_database()
            await db["generated_quizzes"].insert_one(
                {
                    "article_title": article_title,
                    "questions": [question.model_dump() for question in questions],
                    "generated_by": generated_by,
                }
            )
        except Exception as exc:
            logger.exception("Failed to store generated quiz: %s", exc)
            raise AppException(status_code=500, message="Failed to save generated quiz", details=str(exc)) from exc


content_service = ContentService()
