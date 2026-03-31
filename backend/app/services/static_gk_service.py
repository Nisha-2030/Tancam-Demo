import asyncio
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
from pathlib import Path
import re
from typing import Any, Literal

import httpx

from app.core.config import settings
from app.core.database import get_database
from app.core.exceptions import AppException
from app.schemas.content import GKFact, GKTopicMatch, LinkStaticGKRequest, LinkStaticGKResponse
from app.schemas.news import NewsArticle
from app.services.ai_service import openai_service

logger = logging.getLogger(__name__)


class StaticGKService:
    DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "static_gk_dataset.json"

    def __init__(self) -> None:
        self._json_dataset_cache: list[dict[str, Any]] | None = None
        self._external_dataset_cache: list[dict[str, Any]] | None = None
        self._embedding_cache: dict[str, list[float]] = {}

    async def link_article(self, payload: LinkStaticGKRequest) -> LinkStaticGKResponse:
        dataset_source, dataset = await self._resolve_dataset(payload.dataset_source)
        article_text = self._article_text(payload.article)
        if not dataset:
            fallback = self._build_generic_topic_match(payload.article, article_text)
            return LinkStaticGKResponse(
                topic_matches=[fallback],
                total_matches=1,
                used_embeddings=False,
                dataset_source=dataset_source,
            )

        candidates: list[dict[str, Any]] = []

        for topic in dataset:
            lexical_score, matched_keywords = self._keyword_match_score(article_text, topic)
            if lexical_score < max(payload.min_score * 0.5, 0.05):
                continue
            candidates.append(
                {
                    "topic": topic,
                    "lexical_score": lexical_score,
                    "matched_keywords": matched_keywords,
                }
            )

        if not candidates:
            fallback = self._build_generic_topic_match(payload.article, article_text)
            if payload.persist_result:
                await self._store_link_result(payload.article, [fallback], dataset_source, used_embeddings=False)
            return LinkStaticGKResponse(
                topic_matches=[fallback],
                total_matches=1,
                used_embeddings=False,
                dataset_source=dataset_source,
            )

        candidates.sort(key=lambda item: item["lexical_score"], reverse=True)

        used_embeddings = False
        if payload.use_embeddings:
            candidates, used_embeddings = await self._embedding_rerank(article_text, candidates, payload.top_k)

        matches: list[GKTopicMatch] = []
        for candidate in candidates:
            lexical_score = candidate["lexical_score"]
            embedding_score = candidate.get("embedding_score")
            final_confidence = lexical_score
            match_method: Literal["keyword", "keyword+embedding"] = "keyword"

            if used_embeddings and embedding_score is not None:
                final_confidence = round((0.65 * lexical_score) + (0.35 * embedding_score), 4)
                match_method = "keyword+embedding"

            if final_confidence < payload.min_score:
                continue

            topic = candidate["topic"]
            base_facts = [
                GKFact(key=str(fact.get("key", "")), value=str(fact.get("value", "")))
                for fact in topic.get("facts", [])
                if isinstance(fact, dict)
            ]
            enriched_facts = self._enrich_facts_with_ministry_context(
                article_text=article_text,
                category=str(topic.get("category", "General")),
                existing_facts=base_facts,
            )
            match = GKTopicMatch(
                topic_id=str(topic.get("topic_id", "")),
                topic_name=str(topic.get("topic_name", "")),
                category=str(topic.get("category", "General")),
                confidence=final_confidence,
                match_method=match_method,
                matched_keywords=candidate["matched_keywords"][:10],
                facts=enriched_facts,
            )
            matches.append(match)

        matches.sort(key=lambda item: item.confidence, reverse=True)
        matches = matches[: payload.top_k]

        if payload.persist_result and matches:
            await self._store_link_result(payload.article, matches, dataset_source, used_embeddings)

        return LinkStaticGKResponse(
            topic_matches=matches,
            total_matches=len(matches),
            used_embeddings=used_embeddings,
            dataset_source=dataset_source,
        )

    def _build_generic_topic_match(self, article: NewsArticle, article_text: str) -> GKTopicMatch:
        category = self._infer_category(article_text)
        focus_terms = self._focus_terms(article_text)
        focus_phrase = ", ".join(focus_terms[:4]) if focus_terms else "policy, governance, implementation"
        published_on = article.published_at.strftime("%Y-%m-%d")

        facts = [
            GKFact(key="Primary Source", value=article.source),
            GKFact(key="Category", value=category),
            GKFact(key="Published On", value=published_on),
            GKFact(key="Revision Focus", value=focus_phrase),
            GKFact(
                key="Exam Angle",
                value=(
                    "Revise institutional role, policy objective, beneficiaries, and implementation mechanism"
                ),
            ),
        ]
        facts = self._enrich_facts_with_ministry_context(
            article_text=article_text,
            category=category,
            existing_facts=facts,
        )

        return GKTopicMatch(
            topic_id=f"generic_{self._article_key(article)[:12]}",
            topic_name=f"Current Affairs Context: {self._truncate(article.title, 10)}",
            category=category,
            confidence=0.4,
            match_method="keyword",
            matched_keywords=focus_terms[:10],
            facts=facts,
        )

    async def sync_json_dataset_to_mongo(self) -> int:
        dataset = self._load_json_dataset()
        if not dataset:
            return 0

        db = get_database()
        upserted_count = 0
        for topic in dataset:
            normalized_topic = self._normalize_topic_schema(topic)
            await db["static_gk"].update_one(
                {"topic_id": normalized_topic.get("topic_id")},
                {"$set": {**normalized_topic, "source_tag": "json"}},
                upsert=True,
            )
            upserted_count += 1
        return upserted_count

    async def sync_external_dataset_to_mongo(self) -> int:
        dataset = await self._load_external_dataset(force_refresh=True)
        if not dataset:
            return 0

        db = get_database()
        upserted_count = 0
        now = datetime.now(timezone.utc)
        for topic in dataset:
            normalized_topic = self._normalize_topic_schema(topic)
            topic_id = normalized_topic.get("topic_id")
            if not topic_id:
                continue

            await db["static_gk"].update_one(
                {"topic_id": topic_id},
                {
                    "$set": {
                        **normalized_topic,
                        "source_tag": "external",
                        "updated_at": now,
                    },
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )
            upserted_count += 1
        return upserted_count

    async def _resolve_dataset(
        self, preferred_source: Literal["auto", "json", "mongo", "external", "merged"]
    ) -> tuple[Literal["json", "mongo", "external", "merged"], list[dict[str, Any]]]:
        json_dataset = self._load_json_dataset()
        mongo_dataset = await self._load_mongo_dataset()
        external_dataset = await self._load_external_dataset()

        if preferred_source == "json":
            return "json", self._merge_datasets([json_dataset])

        if preferred_source == "mongo":
            return "mongo", self._merge_datasets([mongo_dataset])

        if preferred_source == "external":
            return "external", self._merge_datasets([external_dataset])

        if preferred_source == "merged":
            return "merged", self._merge_datasets([json_dataset, mongo_dataset, external_dataset])

        merged_dataset = self._merge_datasets([json_dataset, mongo_dataset, external_dataset])
        source_count = int(bool(json_dataset)) + int(bool(mongo_dataset)) + int(bool(external_dataset))
        if source_count >= 2 and merged_dataset:
            return "merged", merged_dataset

        if external_dataset:
            return "external", self._merge_datasets([external_dataset])

        if mongo_dataset:
            return "mongo", self._merge_datasets([mongo_dataset])
        return "json", self._merge_datasets([json_dataset])

    async def _load_external_dataset(self, force_refresh: bool = False) -> list[dict[str, Any]]:
        external_url = (settings.static_gk_external_url or "").strip()
        if not external_url:
            return []

        if self._external_dataset_cache is not None and not force_refresh:
            return self._external_dataset_cache

        headers: dict[str, str] = {"Accept": "application/json"}
        api_key = (settings.static_gk_external_api_key or "").strip()
        auth_header = settings.static_gk_external_auth_header.strip() or "Authorization"
        if api_key:
            if auth_header.lower() == "authorization" and not api_key.lower().startswith("bearer "):
                headers[auth_header] = f"Bearer {api_key}"
            else:
                headers[auth_header] = api_key
            if auth_header.lower() != "x-api-key":
                headers.setdefault("x-api-key", api_key)

        try:
            async with httpx.AsyncClient(
                timeout=settings.static_gk_external_timeout_seconds,
                verify=settings.static_gk_external_verify_ssl,
            ) as client:
                response = await client.get(external_url, headers=headers)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            logger.warning("Failed to load external Static GK dataset: %s", exc)
            if self._external_dataset_cache is not None:
                return self._external_dataset_cache
            return []

        raw_topics = self._extract_external_topics(payload)
        normalized_topics: list[dict[str, Any]] = []
        for index, raw_topic in enumerate(raw_topics):
            normalized = self._normalize_external_topic(raw_topic, index)
            if normalized:
                normalized_topics.append(normalized)

        self._external_dataset_cache = self._merge_datasets([normalized_topics])
        return self._external_dataset_cache

    def _extract_external_topics(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]

        if not isinstance(payload, dict):
            return []

        for key in ("topics", "results", "items", "data", "content"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                for nested_key in ("topics", "results", "items"):
                    nested = value.get(nested_key)
                    if isinstance(nested, list):
                        return [item for item in nested if isinstance(item, dict)]
        return []

    def _normalize_external_topic(self, topic: dict[str, Any], index: int) -> dict[str, Any] | None:
        topic_name = str(
            topic.get("topic_name")
            or topic.get("name")
            or topic.get("title")
            or topic.get("topic")
            or ""
        ).strip()
        if not topic_name:
            return None

        raw_topic_id = (
            topic.get("topic_id")
            or topic.get("id")
            or topic.get("slug")
            or self._slugify(topic_name, index)
        )
        category = str(topic.get("category") or topic.get("subject") or "Current Affairs").strip()

        aliases = self._to_string_list(topic.get("aliases"))
        aliases += self._to_string_list(topic.get("synonyms"))
        aliases += self._to_string_list(topic.get("alt_names"))
        aliases += self._to_string_list(topic.get("tags"))
        keywords = self._to_string_list(topic.get("keywords"))
        keywords += self._to_string_list(topic.get("key_terms"))
        keywords += self._to_string_list(topic.get("tags"))

        facts = self._normalize_facts(topic)
        if not facts:
            overview = str(topic.get("description") or topic.get("summary") or "").strip()
            if overview:
                facts = [{"key": "Overview", "value": overview}]

        normalized = {
            "topic_id": self._slugify(str(raw_topic_id), index),
            "topic_name": topic_name,
            "category": category or "Current Affairs",
            "aliases": aliases,
            "keywords": keywords,
            "facts": facts,
        }
        return self._normalize_topic_schema(normalized)

    def _normalize_facts(self, topic: dict[str, Any]) -> list[dict[str, str]]:
        facts: list[dict[str, str]] = []
        raw_facts = topic.get("facts")

        if isinstance(raw_facts, list):
            for entry in raw_facts:
                if isinstance(entry, dict):
                    key = str(entry.get("key") or entry.get("name") or entry.get("label") or "").strip()
                    value = str(entry.get("value") or entry.get("text") or entry.get("description") or "").strip()
                    if key and value:
                        facts.append({"key": key, "value": value})
                elif isinstance(entry, str) and ":" in entry:
                    key, value = entry.split(":", 1)
                    key = key.strip()
                    value = value.strip()
                    if key and value:
                        facts.append({"key": key, "value": value})

        if isinstance(raw_facts, dict):
            for key, value in raw_facts.items():
                clean_key = str(key).strip()
                clean_value = str(value).strip()
                if clean_key and clean_value:
                    facts.append({"key": clean_key, "value": clean_value})

        common_fact_fields = (
            ("founded", "Founded"),
            ("established", "Established"),
            ("headquarters", "Headquarters"),
            ("hq", "Headquarters"),
            ("chairman", "Chairman"),
            ("chairperson", "Chairperson"),
            ("governor", "Governor"),
            ("mandate", "Mandate"),
            ("objective", "Objective"),
            ("exam_relevance", "Exam Relevance"),
        )
        for source_key, target_key in common_fact_fields:
            value = str(topic.get(source_key) or "").strip()
            if value:
                facts.append({"key": target_key, "value": value})

        deduped: list[dict[str, str]] = []
        seen: set[str] = set()
        for fact in facts:
            key = str(fact.get("key", "")).strip()
            value = str(fact.get("value", "")).strip()
            if not key or not value:
                continue
            signature = self._normalize(f"{key}|{value}")
            if signature in seen:
                continue
            seen.add(signature)
            deduped.append({"key": key, "value": value})
            if len(deduped) >= 12:
                break
        return deduped

    def _merge_datasets(self, datasets: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
        merged: dict[str, dict[str, Any]] = {}
        topic_name_index: dict[str, str] = {}

        for dataset in datasets:
            for raw_topic in dataset:
                normalized = self._normalize_topic_schema(raw_topic)
                topic_id = str(normalized.get("topic_id") or "").strip()
                topic_name = str(normalized.get("topic_name") or "").strip()
                if not topic_name:
                    continue
                if not topic_id:
                    topic_id = self._slugify(topic_name, len(merged))
                    normalized["topic_id"] = topic_id

                topic_name_key = self._normalize(topic_name)
                resolved_id = topic_name_index.get(topic_name_key, topic_id)

                if resolved_id in merged:
                    merged[resolved_id] = self._merge_topic_entries(merged[resolved_id], normalized)
                else:
                    merged[resolved_id] = normalized

                topic_name_index[topic_name_key] = resolved_id

        return list(merged.values())

    def _merge_topic_entries(self, base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
        base_aliases = self._to_string_list(base.get("aliases"))
        incoming_aliases = self._to_string_list(incoming.get("aliases"))
        aliases = self._dedupe_text_list([*base_aliases, *incoming_aliases])

        base_keywords = self._to_string_list(base.get("keywords"))
        incoming_keywords = self._to_string_list(incoming.get("keywords"))
        keywords = self._dedupe_text_list([*base_keywords, *incoming_keywords])

        facts = self._normalize_facts({"facts": [*base.get("facts", []), *incoming.get("facts", [])]})
        category = str(base.get("category") or incoming.get("category") or "Current Affairs")

        merged = {
            "topic_id": str(base.get("topic_id") or incoming.get("topic_id") or ""),
            "topic_name": str(base.get("topic_name") or incoming.get("topic_name") or ""),
            "category": category,
            "aliases": aliases,
            "keywords": keywords,
            "facts": facts,
        }
        return self._normalize_topic_schema(merged)

    def _normalize_topic_schema(self, topic: dict[str, Any]) -> dict[str, Any]:
        topic_name = str(topic.get("topic_name") or topic.get("name") or "").strip()
        topic_id_raw = str(topic.get("topic_id") or topic.get("id") or "").strip()
        topic_id = self._slugify(topic_id_raw or topic_name, 0)
        category = str(topic.get("category") or "Current Affairs").strip() or "Current Affairs"
        aliases = self._dedupe_text_list(self._to_string_list(topic.get("aliases")))
        keywords = self._dedupe_text_list(self._to_string_list(topic.get("keywords")))
        facts = self._normalize_facts({"facts": topic.get("facts", [])})

        return {
            "topic_id": topic_id,
            "topic_name": topic_name,
            "category": category,
            "aliases": aliases,
            "keywords": keywords,
            "facts": facts,
        }

    def _to_string_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            if "," in value:
                return [part.strip() for part in value.split(",") if part.strip()]
            return [value.strip()]
        return []

    def _dedupe_text_list(self, values: list[str]) -> list[str]:
        unique: list[str] = []
        seen: set[str] = set()
        for value in values:
            cleaned = str(value).strip()
            if not cleaned:
                continue
            signature = self._normalize(cleaned)
            if signature in seen:
                continue
            seen.add(signature)
            unique.append(cleaned)
        return unique

    def _slugify(self, text: str, fallback_index: int) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", str(text or "").strip().lower()).strip("_")
        return cleaned or f"topic_{fallback_index + 1}"

    async def _load_mongo_dataset(self) -> list[dict[str, Any]]:
        try:
            db = get_database()
            docs = await db["static_gk"].find({}, {"_id": 0}).to_list(length=500)
            return [doc for doc in docs if isinstance(doc, dict)]
        except Exception as exc:
            logger.warning("Could not load static_gk collection from MongoDB: %s", exc)
            return []

    def _load_json_dataset(self) -> list[dict[str, Any]]:
        if self._json_dataset_cache is not None:
            return self._json_dataset_cache

        if not self.DATASET_PATH.exists():
            raise AppException(status_code=500, message="Static GK dataset file missing", details=str(self.DATASET_PATH))

        try:
            with self.DATASET_PATH.open("r", encoding="utf-8") as file:
                payload = json.load(file)
        except json.JSONDecodeError as exc:
            raise AppException(status_code=500, message="Invalid static GK dataset JSON", details=str(exc)) from exc

        if not isinstance(payload, list):
            raise AppException(status_code=500, message="Static GK dataset must be a JSON array")

        self._json_dataset_cache = [item for item in payload if isinstance(item, dict)]
        return self._json_dataset_cache

    async def _embedding_rerank(
        self, article_text: str, candidates: list[dict[str, Any]], top_k: int
    ) -> tuple[list[dict[str, Any]], bool]:
        if not openai_service.enabled:
            return candidates, False

        rerank_limit = min(max(4, top_k * 2), 10, len(candidates))
        rerank_subset = candidates[:rerank_limit]
        query_embedding = await openai_service.create_embedding(article_text)
        if not query_embedding:
            return candidates, False

        topic_embedding_tasks = [self._topic_embedding(topic["topic"]) for topic in rerank_subset]
        topic_vectors = await asyncio.gather(*topic_embedding_tasks)

        for idx, vector in enumerate(topic_vectors):
            if vector is None:
                continue
            cosine_score = self._cosine_similarity(query_embedding, vector)
            rerank_subset[idx]["embedding_score"] = round(max(0.0, cosine_score), 4)

        for candidate in candidates:
            lexical = candidate["lexical_score"]
            embed = candidate.get("embedding_score")
            preview_score = (0.65 * lexical) + (0.35 * embed) if embed is not None else lexical
            candidate["_preview_score"] = round(preview_score, 4)

        candidates.sort(key=lambda item: item["_preview_score"], reverse=True)
        return candidates, True

    async def _topic_embedding(self, topic: dict[str, Any]) -> list[float] | None:
        topic_id = str(topic.get("topic_id", ""))
        if topic_id in self._embedding_cache:
            return self._embedding_cache[topic_id]

        text = self._topic_text(topic)
        vector = await openai_service.create_embedding(text)
        if vector:
            self._embedding_cache[topic_id] = vector
        return vector

    def _keyword_match_score(self, article_text: str, topic: dict[str, Any]) -> tuple[float, list[str]]:
        normalized_text = self._normalize(article_text)
        aliases = [self._normalize(alias) for alias in topic.get("aliases", [])]
        keywords = [self._normalize(word) for word in topic.get("keywords", [])]
        topic_name = self._normalize(str(topic.get("topic_name", "")))

        alias_hits = [alias for alias in aliases if alias and alias in normalized_text]
        keyword_hits = [word for word in keywords if word and word in normalized_text]
        topic_name_hit = 1.0 if topic_name and topic_name in normalized_text else 0.0

        alias_score = min(1.0, len(alias_hits) / 2) if alias_hits else 0.0
        keyword_score = len(keyword_hits) / max(1, min(len(keywords), 8))
        lexical_score = round(
            min(
                1.0,
                (0.5 * keyword_score) + (0.4 * alias_score) + (0.1 * topic_name_hit),
            ),
            4,
        )

        matched_keywords = list(dict.fromkeys(alias_hits + keyword_hits))
        return lexical_score, matched_keywords

    async def _store_link_result(
        self,
        article: NewsArticle,
        matches: list[GKTopicMatch],
        dataset_source: Literal["json", "mongo", "external", "merged"],
        used_embeddings: bool,
    ) -> None:
        try:
            db = get_database()
            key = self._article_key(article)
            now = datetime.now(timezone.utc)
            payload = {
                "article_key": key,
                "article": article.model_dump(),
                "topic_matches": [match.model_dump() for match in matches],
                "dataset_source": dataset_source,
                "used_embeddings": used_embeddings,
                "updated_at": now,
            }
            await db["news_gk_links"].update_one(
                {"article_key": key},
                {"$set": payload, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
        except Exception as exc:
            logger.exception("Failed to persist static GK link result: %s", exc)
            raise AppException(status_code=500, message="Failed to save static GK link result", details=str(exc)) from exc

    def _article_text(self, article: NewsArticle) -> str:
        return f"{article.title} {article.description or ''} {article.content or ''}"

    def _topic_text(self, topic: dict[str, Any]) -> str:
        facts_joined = " ".join(
            f"{fact.get('key', '')} {fact.get('value', '')}"
            for fact in topic.get("facts", [])
            if isinstance(fact, dict)
        )
        alias_joined = " ".join(topic.get("aliases", []))
        keyword_joined = " ".join(topic.get("keywords", []))
        return (
            f"{topic.get('topic_name', '')} {topic.get('category', '')} "
            f"{alias_joined} {keyword_joined} {facts_joined}"
        )

    def _article_key(self, article: NewsArticle) -> str:
        normalized = self._normalize(f"{article.title}|{article.url or ''}")
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _normalize(self, text: str) -> str:
        return " ".join(text.lower().strip().split())

    def _truncate(self, text: str, max_words: int) -> str:
        words = str(text or "").split()
        if len(words) <= max_words:
            return " ".join(words)
        return " ".join(words[:max_words])

    def _focus_terms(self, article_text: str) -> list[str]:
        stopwords = {
            "the",
            "and",
            "for",
            "with",
            "this",
            "that",
            "from",
            "were",
            "has",
            "have",
            "was",
            "are",
            "but",
            "into",
            "about",
            "under",
            "over",
            "will",
            "news",
            "today",
        }
        tokens = re.findall(r"[a-zA-Z]{4,}", article_text.lower())
        unique: list[str] = []
        seen: set[str] = set()
        for token in tokens:
            if token in stopwords or token in seen:
                continue
            seen.add(token)
            unique.append(token)
            if len(unique) == 12:
                break
        return unique

    def _infer_category(self, article_text: str) -> str:
        text = article_text.lower()
        rules = [
            ("Economy", ["rbi", "inflation", "liquidity", "budget", "fiscal", "bank"]),
            ("Science and Technology", ["isro", "satellite", "space", "technology", "digital", "ai"]),
            ("Polity and Governance", ["parliament", "committee", "ministry", "policy", "governance"]),
            ("Environment", ["climate", "adaptation", "emissions", "carbon", "environment"]),
            ("International Relations", ["un", "bilateral", "global", "summit", "treaty"]),
            ("Social Sector", ["education", "health", "skilling", "employment", "welfare"]),
        ]
        for category, keywords in rules:
            if any(keyword in text for keyword in keywords):
                return category
        return "Current Affairs"

    def _enrich_facts_with_ministry_context(
        self,
        article_text: str,
        category: str,
        existing_facts: list[GKFact],
    ) -> list[GKFact]:
        facts = [GKFact(key=fact.key, value=fact.value) for fact in existing_facts]
        ministries = self._extract_ministries(article_text, category)
        ministers = self._extract_minister_mentions(article_text)

        for index, item in enumerate(ministries[:3], start=1):
            facts.append(GKFact(key=f"Involved Ministry {index}", value=item["name"]))
            facts.append(GKFact(key=f"Role {index}", value=item["position"]))

        for index, item in enumerate(ministers[:2], start=1):
            facts.append(GKFact(key=f"Minister Mentioned {index}", value=item["name"]))
            facts.append(GKFact(key=f"Position {index}", value=item["position"]))

        return self._dedupe_gk_facts(facts, max_items=14)

    def _extract_ministries(self, article_text: str, category: str) -> list[dict[str, str]]:
        text = article_text.lower()
        ministry_patterns: list[dict[str, object]] = [
            {
                "name": "Ministry of Finance",
                "position": "Nodal ministry for economic and fiscal policy",
                "keywords": ["rbi", "inflation", "budget", "fiscal", "tax", "bank", "liquidity"],
            },
            {
                "name": "Ministry of Home Affairs",
                "position": "Nodal ministry for internal security and administration",
                "keywords": ["internal security", "police", "disaster", "mha", "home ministry"],
            },
            {
                "name": "Ministry of External Affairs",
                "position": "Nodal ministry for diplomacy and international engagement",
                "keywords": ["bilateral", "summit", "treaty", "foreign", "diplomatic", "mea"],
            },
            {
                "name": "Ministry of Education",
                "position": "Nodal ministry for education policy and implementation",
                "keywords": ["school", "higher education", "curriculum", "learning", "education"],
            },
            {
                "name": "Ministry of Environment, Forest and Climate Change",
                "position": "Nodal ministry for climate and environmental governance",
                "keywords": ["climate", "emissions", "forest", "pollution", "environment", "carbon"],
            },
            {
                "name": "Ministry of Science and Technology",
                "position": "Nodal ministry for science missions and research programs",
                "keywords": ["research", "innovation", "science", "technology mission"],
            },
            {
                "name": "Department of Space",
                "position": "Nodal department for national space programs",
                "keywords": ["isro", "satellite", "launch", "space", "mission"],
            },
            {
                "name": "Ministry of Electronics and Information Technology",
                "position": "Nodal ministry for digital governance and IT initiatives",
                "keywords": ["digital", "cyber", "ai", "electronics", "internet"],
            },
            {
                "name": "Ministry of Health and Family Welfare",
                "position": "Nodal ministry for national public health systems",
                "keywords": ["health", "hospital", "vaccination", "public health"],
            },
            {
                "name": "Ministry of Skill Development and Entrepreneurship",
                "position": "Nodal ministry for skilling and employability programs",
                "keywords": ["skilling", "employment", "training", "entrepreneurship"],
            },
        ]

        detected: list[dict[str, str]] = []
        seen: set[str] = set()
        for pattern in ministry_patterns:
            keywords = pattern.get("keywords", [])
            if any(keyword in text for keyword in keywords):
                name = str(pattern["name"])
                if name.lower() in seen:
                    continue
                seen.add(name.lower())
                detected.append({"name": name, "position": str(pattern["position"])})

        # Capture explicit mentions such as "Ministry of X".
        explicit_mentions = re.findall(
            r"(ministry of [a-z][a-z\s,&-]{2,80})",
            text,
            flags=re.IGNORECASE,
        )
        for mention in explicit_mentions[:4]:
            clean = " ".join(mention.split()).strip().title()
            if clean.lower() in seen:
                continue
            seen.add(clean.lower())
            detected.append({"name": clean, "position": "Mentioned in source context"})

        if detected:
            return detected

        category_defaults = {
            "Economy": {"name": "Ministry of Finance", "position": "Primary policy ministry"},
            "Science and Technology": {"name": "Ministry of Science and Technology", "position": "Primary policy ministry"},
            "Polity and Governance": {"name": "Ministry of Home Affairs", "position": "Administrative policy ministry"},
            "Environment": {
                "name": "Ministry of Environment, Forest and Climate Change",
                "position": "Primary policy ministry",
            },
            "International Relations": {"name": "Ministry of External Affairs", "position": "Primary policy ministry"},
            "Social Sector": {"name": "Ministry of Education", "position": "Primary policy ministry"},
        }
        fallback = category_defaults.get(category, {"name": "Relevant Union Ministry", "position": "Primary policy ministry"})
        return [fallback]

    def _extract_minister_mentions(self, article_text: str) -> list[dict[str, str]]:
        text = article_text
        pattern = re.compile(
            r"\b(Union Minister|Cabinet Minister|Minister of State|Secretary)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})"
        )
        mentions: list[dict[str, str]] = []
        seen: set[str] = set()
        for position, name in pattern.findall(text):
            signature = self._normalize(f"{position}|{name}")
            if signature in seen:
                continue
            seen.add(signature)
            mentions.append({"name": name.strip(), "position": position.strip()})
            if len(mentions) >= 3:
                break
        return mentions

    def _dedupe_gk_facts(self, facts: list[GKFact], max_items: int = 12) -> list[GKFact]:
        deduped: list[GKFact] = []
        seen: set[str] = set()
        for fact in facts:
            key = str(fact.key).strip()
            value = str(fact.value).strip()
            if not key or not value:
                continue
            signature = self._normalize(f"{key}|{value}")
            if signature in seen:
                continue
            seen.add(signature)
            deduped.append(GKFact(key=key, value=value))
            if len(deduped) >= max_items:
                break
        return deduped

    def _cosine_similarity(self, vector_a: list[float], vector_b: list[float]) -> float:
        if not vector_a or not vector_b:
            return 0.0
        if len(vector_a) != len(vector_b):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vector_a, vector_b))
        magnitude_a = math.sqrt(sum(a * a for a in vector_a))
        magnitude_b = math.sqrt(sum(b * b for b in vector_b))
        if magnitude_a == 0 or magnitude_b == 0:
            return 0.0
        return dot_product / (magnitude_a * magnitude_b)


static_gk_service = StaticGKService()
