from datetime import datetime, timezone
import hashlib
import logging

from app.core.database import get_database
from app.core.exceptions import AppException
from app.schemas.news import NewsArticle, TrustScoreFactors, TrustScoreItem
from app.utils.scoring import is_government_source, is_trusted_source, source_reliability, to_trust_level

logger = logging.getLogger(__name__)


class TrustService:
    TRUSTED_SCORE = 80.0
    SINGLE_SOURCE_SCORE = 60.0
    GOVERNMENT_SCORE = 100.0

    async def assign_scores(self, items: list[NewsArticle]) -> list[TrustScoreItem]:
        scored_items: list[TrustScoreItem] = []

        for item in items:
            all_sources = await self._collect_verification_sources(item)
            (
                trust_score,
                verification_rule,
                trusted_source_count,
                confidence_note,
                reliability_map,
                verified_sources,
            ) = self._calculate_trust_score(item.source, all_sources)

            scored_item = TrustScoreItem(
                article=item,
                trust_score=trust_score,
                trust_level=to_trust_level(trust_score),
                factors=TrustScoreFactors(
                    primary_source=item.source,
                    primary_source_reliability=round(source_reliability(item.source), 2),
                    source_reliability_map=reliability_map,
                    trusted_source_count=trusted_source_count,
                    cross_verified_sources=verified_sources,
                    verification_rule=verification_rule,
                    dynamic_updated_at=datetime.now(timezone.utc),
                ),
                confidence_note=confidence_note,
            )

            scored_item.version = await self._upsert_scored_item(scored_item)
            scored_items.append(scored_item)

        return scored_items

    def _calculate_trust_score(
        self, primary_source: str, all_sources: list[str]
    ) -> tuple[float, str, int, str, dict[str, float], list[str]]:
        normalized_unique_sources = self._unique_sources([primary_source, *all_sources])
        trusted_sources = [source for source in normalized_unique_sources if is_trusted_source(source)]
        reliability_map = {source: round(source_reliability(source), 2) for source in normalized_unique_sources}

        if is_government_source(primary_source):
            return (
                self.GOVERNMENT_SCORE,
                "government_source",
                len(trusted_sources),
                "Primary source is PIB (government source).",
                reliability_map,
                trusted_sources,
            )

        if len(trusted_sources) >= 2:
            return (
                self.TRUSTED_SCORE,
                "cross_verified_two_or_more_trusted_sources",
                len(trusted_sources),
                "Article is cross-verified by at least two trusted sources.",
                reliability_map,
                trusted_sources,
            )

        return (
            self.SINGLE_SOURCE_SCORE,
            "single_source_only",
            len(trusted_sources),
            "Single-source evidence available; needs additional trusted verification.",
            reliability_map,
            trusted_sources,
        )

    async def _collect_verification_sources(self, item: NewsArticle) -> list[str]:
        collected_sources = list(item.supporting_sources or [])

        db = get_database()
        title_query = {"title": item.title}
        if item.url:
            query = {"$or": [title_query, {"url": item.url}]}
        else:
            query = title_query

        # Pull corroborating sources from ingested news records.
        cursor = db["news_raw"].find(query, {"source": 1}).limit(30)
        async for doc in cursor:
            source = doc.get("source")
            if isinstance(source, str) and source.strip():
                collected_sources.append(source)

        # Pull existing trusted record sources for dynamic updates.
        existing = await db["news_trust_scores"].find_one({"article_key": self._article_key(item)})
        if existing:
            existing_sources = (
                (existing.get("factors") or {}).get("cross_verified_sources")
                or []
            )
            collected_sources.extend([source for source in existing_sources if isinstance(source, str)])

        return self._unique_sources(collected_sources)

    async def _upsert_scored_item(self, scored_item: TrustScoreItem) -> int:
        try:
            db = get_database()
            collection = db["news_trust_scores"]
            article_key = self._article_key(scored_item.article)
            now = datetime.now(timezone.utc)

            existing = await collection.find_one({"article_key": article_key})
            payload = scored_item.model_dump()
            payload["article_key"] = article_key
            payload["updated_at"] = now

            if not existing:
                payload["created_at"] = now
                payload["score_history"] = []
                await collection.insert_one(payload)
                return 1

            existing_version = int(existing.get("version", 1))
            existing_score = float(existing.get("trust_score", 0.0))
            existing_sources = set(((existing.get("factors") or {}).get("cross_verified_sources") or []))
            new_sources = set(scored_item.factors.cross_verified_sources)
            score_changed = existing_score != scored_item.trust_score
            sources_changed = existing_sources != new_sources

            if score_changed or sources_changed:
                new_version = existing_version + 1
                history_entry = {
                    "version": existing_version,
                    "trust_score": existing_score,
                    "trust_level": existing.get("trust_level"),
                    "updated_at": existing.get("updated_at") or existing.get("created_at"),
                    "factors": existing.get("factors"),
                }
                await collection.update_one(
                    {"_id": existing["_id"]},
                    {
                        "$set": {
                            **payload,
                            "version": new_version,
                            "created_at": existing.get("created_at", now),
                        },
                        "$push": {"score_history": history_entry},
                    },
                )
                return new_version

            await collection.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        **payload,
                        "version": existing_version,
                        "created_at": existing.get("created_at", now),
                    }
                },
            )
            return existing_version
        except Exception as exc:
            logger.exception("Failed to upsert trust score in MongoDB: %s", exc)
            raise AppException(status_code=500, message="Failed to persist trust score", details=str(exc)) from exc

    def _unique_sources(self, sources: list[str]) -> list[str]:
        seen = set()
        unique = []
        for source in sources:
            normalized = source.lower().strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                unique.append(normalized)
        return unique

    def _article_key(self, item: NewsArticle) -> str:
        normalized_title = " ".join(item.title.lower().strip().split())
        normalized_url = (item.url or "").strip().lower()
        payload = f"{normalized_title}|{normalized_url}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


trust_service = TrustService()
