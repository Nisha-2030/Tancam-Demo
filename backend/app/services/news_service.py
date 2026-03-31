from datetime import datetime, timezone
import logging
from time import perf_counter
from typing import Any

import httpx

from app.core.cache import cache_service, make_cache_key
from app.core.config import settings
from app.core.database import get_database
from app.core.exceptions import AppException
from app.schemas.news import (
    FetchNewsRequest,
    FilterNewsRequest,
    FilterNewsResponse,
    NewsArticle,
    RunPipelineRequest,
    RunPipelineResponse,
)
from app.services.filtering_service import filtering_service
from app.services.trust_service import trust_service

logger = logging.getLogger(__name__)


class NewsService:
    async def fetch_news(self, payload: FetchNewsRequest) -> list[NewsArticle]:
        cache_key = make_cache_key(
            "news:fetch",
            {"query": payload.query.strip().lower(), "limit": payload.limit},
        )

        async def producer() -> list[dict]:
            if settings.news_api_url and settings.news_api_key:
                items = await self._fetch_from_external_api(payload.query, payload.limit)
            else:
                items = self._fallback_news(payload.query, payload.limit)
            return [item.model_dump(mode="json") for item in items]

        cached_payload, cache_hit = await cache_service.get_or_set_json(
            cache_key,
            ttl_seconds=settings.cache_ttl_news_fetch_seconds,
            producer=producer,
        )
        if not isinstance(cached_payload, list):
            cached_payload = []
        items = [NewsArticle.model_validate(item) for item in cached_payload]
        if not cache_hit:
            await self._store_articles("news_raw", items)
        return items

    async def filter_news(self, payload: FilterNewsRequest) -> FilterNewsResponse:
        cache_key = make_cache_key("news:filter", payload.model_dump(mode="json"))

        async def producer() -> dict:
            result = await filtering_service.run_pipeline(payload)
            return result.model_dump(mode="json")

        cached_payload, _ = await cache_service.get_or_set_json(
            cache_key,
            ttl_seconds=settings.cache_ttl_news_filter_seconds,
            producer=producer,
        )
        if not isinstance(cached_payload, dict) or "ranked_items" not in cached_payload:
            fallback_result = await filtering_service.run_pipeline(payload)
            return fallback_result
        return FilterNewsResponse.model_validate(cached_payload)

    async def run_pipeline(self, payload: RunPipelineRequest) -> RunPipelineResponse:
        cache_key = make_cache_key("news:pipeline", payload.model_dump(mode="json"))

        async def producer() -> dict:
            started = perf_counter()
            fetched_items = await self.fetch_news(
                FetchNewsRequest(query=payload.query, limit=payload.limit)
            )
            filtered = await self.filter_news(
                FilterNewsRequest(
                    items=fetched_items,
                    keywords=payload.keywords,
                    excluded_keywords=payload.excluded_keywords,
                    max_llm_batch_size=payload.max_llm_batch_size,
                    use_llm=payload.use_llm,
                )
            )
            filtered_articles = [entry.article for entry in filtered.ranked_items]
            scored_items = await trust_service.assign_scores(filtered_articles)
            elapsed_ms = int((perf_counter() - started) * 1000)
            response = RunPipelineResponse(
                items=scored_items,
                total=len(scored_items),
                total_fetched=len(fetched_items),
                total_filtered=len(filtered_articles),
                processing_ms=elapsed_ms,
                cache_hit=False,
            )
            return response.model_dump(mode="json")

        cached_payload, cache_hit = await cache_service.get_or_set_json(
            cache_key,
            ttl_seconds=settings.cache_ttl_news_pipeline_seconds,
            producer=producer,
        )
        if not isinstance(cached_payload, dict) or "items" not in cached_payload:
            cached_payload = await producer()
            cache_hit = False
        response = RunPipelineResponse.model_validate(cached_payload)
        response.cache_hit = cache_hit
        return response

    async def _fetch_from_external_api(self, query: str, limit: int) -> list[NewsArticle]:
        provider = self._detect_provider(settings.news_api_url or "")
        try:
            async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
                params = self._build_provider_params(provider, query, limit)
                response = await client.get(
                    settings.news_api_url,
                    params=params,
                )
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPError as exc:
            raise AppException(status_code=502, message="Failed to fetch news from upstream API", details=str(exc)) from exc

        items_raw = self._extract_provider_items(provider, payload)
        if not isinstance(items_raw, list):
            raise AppException(status_code=502, message="Upstream news API returned unexpected format")

        items: list[NewsArticle] = []
        for item in items_raw[:limit]:
            parsed = self._parse_provider_item(provider, item)
            if parsed is not None:
                items.append(parsed)

        return items

    def _detect_provider(self, api_url: str) -> str:
        lowered = api_url.lower()
        if "newsdata.io" in lowered:
            return "newsdata"
        if "newsapi.org" in lowered:
            return "newsapi"
        return "generic"

    def _build_provider_params(self, provider: str, query: str, limit: int) -> dict[str, Any]:
        if provider == "newsdata":
            return {
                "q": query,
                "apikey": settings.news_api_key,
                "language": "en",
                "size": limit,
            }
        return {
            "q": query,
            "pageSize": limit,
            "apiKey": settings.news_api_key,
        }

    def _extract_provider_items(self, provider: str, payload: dict[str, Any]) -> list[dict[str, Any]] | None:
        if provider == "newsdata":
            results = payload.get("results")
            return results if isinstance(results, list) else None
        articles = payload.get("articles")
        if isinstance(articles, list):
            return articles
        # Defensive fallback for unknown providers that still return "results".
        results = payload.get("results")
        if isinstance(results, list):
            return results
        return None

    def _parse_provider_item(self, provider: str, item: dict[str, Any]) -> NewsArticle | None:
        if provider == "newsdata":
            return self._parse_newsdata_item(item)
        return self._parse_newsapi_item(item)

    def _parse_newsapi_item(self, item: dict[str, Any]) -> NewsArticle | None:
        source = item.get("source")
        if isinstance(source, dict):
            source_name = source.get("name") or "Unknown"
        else:
            source_name = str(source or "Unknown")

        return NewsArticle(
            title=str(item.get("title") or "Untitled"),
            description=item.get("description"),
            content=item.get("content"),
            source=source_name,
            url=item.get("url"),
            published_at=self._parse_datetime(item.get("publishedAt")),
        )

    def _parse_newsdata_item(self, item: dict[str, Any]) -> NewsArticle | None:
        title = str(item.get("title") or "").strip()
        if not title:
            return None

        source_name = (
            str(item.get("source_id") or "").strip()
            or str(item.get("source_name") or "").strip()
            or "Unknown"
        )
        description = item.get("description")
        content = item.get("content") or description
        url = item.get("link") or item.get("url")

        supporting_sources: list[str] = []
        source_url = item.get("source_url")
        if isinstance(source_url, str) and source_url.strip():
            supporting_sources.append(source_url.strip())

        return NewsArticle(
            title=title,
            description=description,
            content=content,
            source=source_name,
            url=url,
            published_at=self._parse_datetime(item.get("pubDate")),
            supporting_sources=supporting_sources,
        )

    def _parse_datetime(self, date_value: Any) -> datetime:
        if isinstance(date_value, str):
            cleaned = date_value.strip().replace("Z", "+00:00")
            # NewsData sometimes uses "YYYY-MM-DD HH:MM:SS".
            if " " in cleaned and "T" not in cleaned:
                cleaned = cleaned.replace(" ", "T")
            try:
                return datetime.fromisoformat(cleaned)
            except ValueError:
                return datetime.now(timezone.utc)
        return datetime.now(timezone.utc)

    def _fallback_news(self, query: str, limit: int) -> list[NewsArticle]:
        now = datetime.now(timezone.utc)
        templates = [
            "Government launches a new skilling initiative under the national employment mission.",
            "Parliamentary committee publishes recommendations on AI ethics in public services.",
            "New climate adaptation fund announced for flood-prone districts.",
            "RBI releases policy note on inflation outlook and liquidity management.",
            "Education ministry updates digital learning roadmap for rural schools.",
        ]
        items: list[NewsArticle] = []
        for idx in range(limit):
            body = templates[idx % len(templates)]
            items.append(
                NewsArticle(
                    title=f"{query.title()} Update #{idx + 1}",
                    description=body,
                    content=f"{body} This report includes background, stakeholders, and implementation timeline.",
                    source="PIB",
                    url=f"https://example.com/news/{query.lower().replace(' ', '-')}-{idx + 1}",
                    published_at=now,
                )
            )
        return items

    async def _store_articles(self, collection_name: str, items: list[NewsArticle]) -> None:
        if not items:
            return
        try:
            db = get_database()
            await db[collection_name].insert_many([item.model_dump() for item in items])
        except Exception as exc:
            logger.exception("Failed to store records in Mongo collection %s: %s", collection_name, exc)
            raise AppException(status_code=500, message="Failed to persist data in MongoDB", details=str(exc)) from exc


news_service = NewsService()
