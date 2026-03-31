import logging

from app.core.database import get_database
from app.core.exceptions import AppException
from app.schemas.news import (
    FilterNewsRequest,
    FilterNewsResponse,
    FilteredNewsItem,
    KeywordFilterMeta,
    LLMClassificationMeta,
    NewsArticle,
    RankingMeta,
)
from app.services.ai_service import openai_service
from app.utils.scoring import (
    compute_content_quality,
    compute_recency_score,
    compute_source_reputation,
)

logger = logging.getLogger(__name__)


class FilteringService:
    # Default topics relevant to competitive exam current affairs.
    DEFAULT_INCLUDE_KEYWORDS = [
        "policy",
        "government",
        "parliament",
        "economy",
        "inflation",
        "budget",
        "rbi",
        "supreme court",
        "international",
        "geopolitics",
        "climate",
        "environment",
        "science",
        "technology",
        "education",
        "health",
        "agriculture",
        "welfare",
        "governance",
    ]

    # Commonly irrelevant categories for this use case.
    DEFAULT_EXCLUDE_KEYWORDS = [
        "celebrity",
        "movie",
        "box office",
        "gossip",
        "fashion",
        "reality show",
        "cricket score",
        "ipl match",
        "football transfer",
        "astrology",
    ]

    async def run_pipeline(self, payload: FilterNewsRequest) -> FilterNewsResponse:
        include_keywords = self._normalized_keywords(payload.keywords or self.DEFAULT_INCLUDE_KEYWORDS)
        exclude_keywords = self._normalized_keywords(payload.excluded_keywords or self.DEFAULT_EXCLUDE_KEYWORDS)

        # Step 1: Keyword-based filtering.
        stage1_candidates: list[tuple[NewsArticle, KeywordFilterMeta]] = []
        for item in payload.items:
            stage1_meta = self._keyword_filter_meta(item, include_keywords, exclude_keywords)
            if stage1_meta.stage1_passed:
                stage1_candidates.append((item, stage1_meta))

        # Step 2: LLM classification in batches (speed + lower token cost).
        stage1_articles = [article for article, _ in stage1_candidates]
        unique_articles: list[NewsArticle] = []
        stage1_to_unique_index: list[int] = []
        unique_map: dict[str, int] = {}
        for article in stage1_articles:
            key = self._article_dedupe_key(article)
            mapped = unique_map.get(key)
            if mapped is None:
                mapped = len(unique_articles)
                unique_map[key] = mapped
                unique_articles.append(article)
            stage1_to_unique_index.append(mapped)

        llm_results = await openai_service.classify_relevance_batch(
            items=unique_articles,
            include_keywords=include_keywords,
            exclude_keywords=exclude_keywords,
            max_batch_size=payload.max_llm_batch_size,
            use_llm=payload.use_llm,
        )

        # Step 3: Heuristic ranking score.
        ranked_items: list[FilteredNewsItem] = []
        for idx, (article, keyword_meta) in enumerate(stage1_candidates):
            unique_idx = stage1_to_unique_index[idx]
            raw_llm = llm_results.get(
                unique_idx,
                {
                    "label": "irrelevant",
                    "confidence": 0.5,
                    "reason": "Missing classification output",
                    "model": "heuristic-fallback",
                    "fallback_used": True,
                },
            )
            classification = LLMClassificationMeta(
                label=str(raw_llm.get("label", "irrelevant")),
                confidence=float(raw_llm.get("confidence", 0.5)),
                reason=str(raw_llm.get("reason", "No reason")),
                model=str(raw_llm.get("model", "heuristic-fallback")),
                fallback_used=bool(raw_llm.get("fallback_used", True)),
            )

            if classification.label != "relevant":
                continue

            ranking = self._ranking_meta(article, keyword_meta.keyword_score, classification.confidence)
            ranked_items.append(
                FilteredNewsItem(
                    article=article,
                    keyword_filter=keyword_meta,
                    classification=classification,
                    ranking=ranking,
                )
            )

        ranked_items.sort(key=lambda item: item.ranking.rank_score, reverse=True)
        for position, item in enumerate(ranked_items, start=1):
            item.ranking.rank_position = position

        await self._store_filtered_results(ranked_items)

        return FilterNewsResponse(
            ranked_items=ranked_items,
            total_input=len(payload.items),
            stage1_passed=len(stage1_candidates),
            stage2_relevant=len(ranked_items),
            total_ranked=len(ranked_items),
        )

    def _normalized_keywords(self, words: list[str]) -> list[str]:
        unique: list[str] = []
        seen = set()
        for word in words:
            cleaned = word.strip().lower()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                unique.append(cleaned)
        return unique

    def _keyword_filter_meta(
        self,
        article: NewsArticle,
        include_keywords: list[str],
        exclude_keywords: list[str],
    ) -> KeywordFilterMeta:
        text = self._article_text(article)
        include_hits = [word for word in include_keywords if word in text]
        exclude_hits = [word for word in exclude_keywords if word in text]

        include_density = min(1.0, len(include_hits) / max(1, min(len(include_keywords), 5)))
        exclude_penalty = min(0.9, len(exclude_hits) * 0.4)
        keyword_score = round(max(0.0, include_density - exclude_penalty), 4)
        stage1_passed = keyword_score >= 0.2 and not exclude_hits

        return KeywordFilterMeta(
            include_hits=include_hits[:8],
            exclude_hits=exclude_hits[:8],
            keyword_score=keyword_score,
            stage1_passed=stage1_passed,
        )

    def _ranking_meta(self, article: NewsArticle, keyword_score: float, llm_confidence: float) -> RankingMeta:
        source_reputation = compute_source_reputation(article.source)
        recency_score = compute_recency_score(article.published_at)
        content_quality = compute_content_quality(article.content, article.description)

        # Weighted score tuned for speed + explainability.
        rank_score = round(
            100
            * (
                (0.30 * keyword_score)
                + (0.35 * llm_confidence)
                + (0.15 * recency_score)
                + (0.12 * source_reputation)
                + (0.08 * content_quality)
            ),
            2,
        )

        return RankingMeta(
            rank_score=rank_score,
            source_reputation=round(source_reputation, 2),
            recency_score=round(recency_score, 2),
            content_quality=round(content_quality, 2),
            keyword_score=round(keyword_score, 2),
            llm_confidence=round(llm_confidence, 2),
        )

    def _article_text(self, article: NewsArticle) -> str:
        return f"{article.title} {article.description or ''} {article.content or ''}".lower()

    def _article_dedupe_key(self, article: NewsArticle) -> str:
        title = " ".join(article.title.lower().split())
        description = " ".join((article.description or "").lower().split())
        return f"{title}|{description[:120]}"

    async def _store_filtered_results(self, ranked_items: list[FilteredNewsItem]) -> None:
        if not ranked_items:
            return
        try:
            db = get_database()
            await db["news_filtered"].insert_many([item.model_dump() for item in ranked_items])
        except Exception as exc:
            logger.exception("Failed to persist filtered results: %s", exc)
            raise AppException(status_code=500, message="Failed to save filtered results", details=str(exc)) from exc


filtering_service = FilteringService()
