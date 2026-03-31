import json
import logging
import re
import random

from openai import AsyncOpenAI

from app.core.cache import cache_service, make_cache_key
from app.core.config import settings
from app.schemas.content import QuizQuestion
from app.schemas.news import NewsArticle

logger = logging.getLogger(__name__)


class OpenAIService:
    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    @property
    def enabled(self) -> bool:
        return self.client is not None

    async def create_embedding(self, text: str) -> list[float] | None:
        if not self.enabled:
            return None
        normalized = " ".join(text.split())[:3000]
        if not normalized:
            return None

        cache_key = make_cache_key(
            "openai:embedding",
            {"model": settings.openai_embedding_model, "text": normalized},
        )

        async def producer() -> list[float] | None:
            try:
                response = await self.client.embeddings.create(
                    model=settings.openai_embedding_model,
                    input=normalized,
                )
                return response.data[0].embedding if response.data else None
            except Exception as exc:
                logger.warning("Embedding generation failed: %s", exc)
                return None

        cached_payload, _ = await cache_service.get_or_set_json(
            cache_key,
            ttl_seconds=settings.cache_ttl_embedding_seconds,
            producer=producer,
        )
        if not isinstance(cached_payload, list):
            return None
        try:
            return [float(value) for value in cached_payload]
        except Exception:
            return None

    async def classify_relevance_batch(
        self,
        items: list[NewsArticle],
        include_keywords: list[str],
        exclude_keywords: list[str],
        max_batch_size: int = 20,
        use_llm: bool = True,
    ) -> dict[int, dict[str, object]]:
        if not items:
            return {}

        if not self.enabled or not use_llm:
            return {
                idx: self._heuristic_classification(item, include_keywords, exclude_keywords)
                for idx, item in enumerate(items)
            }

        max_batch_size = min(max(max_batch_size, 5), 40)
        output: dict[int, dict[str, object]] = {}

        for start in range(0, len(items), max_batch_size):
            batch = items[start : start + max_batch_size]
            batch_payload = [
                {
                    "id": start + local_idx,
                    "title": article.title,
                    "description": self._truncate(article.description, settings.openai_classification_snippet_chars),
                    "snippet": self._truncate(article.content, settings.openai_classification_snippet_chars),
                    "source": article.source,
                }
                for local_idx, article in enumerate(batch)
            ]
            cache_key = make_cache_key(
                "openai:classification-batch",
                {
                    "model": settings.openai_model,
                    "include_keywords": include_keywords,
                    "exclude_keywords": exclude_keywords,
                    "batch_payload": batch_payload,
                },
            )

            async def producer() -> dict[str, dict[str, object]]:
                prompt = self._build_classification_prompt(batch_payload, include_keywords, exclude_keywords)
                try:
                    completion = await self.client.chat.completions.create(
                        model=settings.openai_model,
                        temperature=0,
                        max_tokens=settings.openai_classification_max_tokens,
                        response_format={"type": "json_object"},
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    "You are a strict relevance classifier for competitive-exam current-affairs."
                                    " Output only valid JSON."
                                ),
                            },
                            {"role": "user", "content": prompt},
                        ],
                    )
                    raw = completion.choices[0].message.content or "{}"
                    parsed = self._load_json(raw, default={})
                    results = parsed.get("results", []) if isinstance(parsed, dict) else []
                    if not isinstance(results, list):
                        raise ValueError("Unexpected result format")

                    batch_output: dict[str, dict[str, object]] = {}
                    for item in results:
                        try:
                            idx = str(int(item.get("id")))
                            label = str(item.get("label", "irrelevant")).lower()
                            confidence = float(item.get("confidence", 0.5))
                            reason = str(item.get("reason", "No reason"))
                            batch_output[idx] = {
                                "label": "relevant" if label == "relevant" else "irrelevant",
                                "confidence": min(max(confidence, 0.0), 1.0),
                                "reason": reason[:120],
                                "model": settings.openai_model,
                                "fallback_used": False,
                            }
                        except Exception:
                            continue
                    return batch_output
                except Exception as exc:
                    logger.warning("LLM classification failed for batch starting %s: %s", start, exc)
                    return {
                        str(start + local_idx): self._heuristic_classification(article, include_keywords, exclude_keywords)
                        for local_idx, article in enumerate(batch)
                    }

            batch_result, _ = await cache_service.get_or_set_json(
                cache_key,
                ttl_seconds=settings.cache_ttl_classification_seconds,
                producer=producer,
            )
            if isinstance(batch_result, dict):
                for raw_idx, value in batch_result.items():
                    try:
                        output[int(raw_idx)] = value
                    except Exception:
                        continue

        # Fill any missing indexes with deterministic fallback.
        for idx, article in enumerate(items):
            if idx not in output:
                output[idx] = self._heuristic_classification(article, include_keywords, exclude_keywords)

        return output

    async def generate_notes(self, article: NewsArticle, exam_context: str | None) -> tuple[str, list[str], str]:
        source_text = self._news_source_text(article)
        if not self.enabled:
            fallback_bullets = self._extractive_bullets(source_text)
            return self._format_bullets(fallback_bullets), fallback_bullets, "fallback-extractive"

        prompt = self._build_notes_prompt(source_text, exam_context)
        try:
            completion = await self.client.chat.completions.create(
                model=settings.openai_model,
                temperature=0,
                max_tokens=settings.openai_notes_max_tokens,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a fact-preserving notes generator. Never add facts not present in source. "
                            "Return strictly valid JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            raw = completion.choices[0].message.content or "{}"
            data = self._load_json(raw, default={})
            bullets = self._validate_grounded_bullets(data.get("bullet_points"), source_text)
            if len(bullets) < 3:
                fallback_bullets = self._extractive_bullets(source_text)
                return self._format_bullets(fallback_bullets), fallback_bullets, "fallback-extractive"
            return self._format_bullets(bullets), bullets, "openai-verified"
        except Exception as exc:
            logger.warning("OpenAI notes generation failed, using extractive fallback: %s", exc)
            fallback_bullets = self._extractive_bullets(source_text)
            return self._format_bullets(fallback_bullets), fallback_bullets, "fallback-extractive"

    async def generate_quiz(
        self, article: NewsArticle, num_questions: int
    ) -> tuple[list[QuizQuestion], str]:
        source_text = self._news_source_text(article)
        if not self.enabled:
            return [self._fallback_single_quiz(source_text)], "fallback-extractive"

        prompt = self._build_quiz_prompt(source_text)
        try:
            completion = await self.client.chat.completions.create(
                model=settings.openai_model,
                temperature=0,
                max_tokens=settings.openai_quiz_max_tokens,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You generate fact-grounded MCQs from given source text only. "
                            "Never use external knowledge. Return strictly valid JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            raw = completion.choices[0].message.content or "{}"
            data = self._load_json(raw, default={})
            question = self._validate_grounded_quiz(data, source_text)
            if question is None:
                return [self._fallback_single_quiz(source_text)], "fallback-extractive"
            return [question], "openai-verified"
        except Exception as exc:
            logger.warning("OpenAI quiz generation failed, using extractive fallback: %s", exc)
            return [self._fallback_single_quiz(source_text)], "fallback-extractive"

    def _build_classification_prompt(
        self,
        batch_payload: list[dict[str, object]],
        include_keywords: list[str],
        exclude_keywords: list[str],
    ) -> str:
        return (
            "Task: Classify each article as relevant or irrelevant for aspirant current-affairs preparation.\n"
            "Relevant if it has governance/policy/economy/international relations/environment/science-tech"
            " significance with exam value.\n"
            "Irrelevant if primarily entertainment/celebrity/gossip/sports-only/crime-only/local event"
            " without policy impact.\n"
            f"Priority keywords: {include_keywords}\n"
            f"Discard keywords/topics: {exclude_keywords}\n"
            "Return JSON ONLY with this schema:\n"
            "{\"results\":[{\"id\":0,\"label\":\"relevant|irrelevant\",\"confidence\":0.0-1.0,\"reason\":\"<=12 words\"}]}\n"
            f"Articles: {json.dumps(batch_payload, ensure_ascii=True)}"
        )

    def _heuristic_classification(
        self,
        article: NewsArticle,
        include_keywords: list[str],
        exclude_keywords: list[str],
    ) -> dict[str, object]:
        text = f"{article.title} {article.description or ''} {article.content or ''}".lower()
        include_hits = sum(1 for word in include_keywords if word.lower() in text)
        exclude_hits = sum(1 for word in exclude_keywords if word.lower() in text)
        label = "relevant" if include_hits >= max(1, exclude_hits + 1) else "irrelevant"
        confidence = 0.55 + (0.1 * min(include_hits, 3)) - (0.12 * min(exclude_hits, 3))
        confidence = min(max(confidence, 0.05), 0.95)
        return {
            "label": label,
            "confidence": confidence,
            "reason": "Heuristic fallback classification",
            "model": "heuristic-fallback",
            "fallback_used": True,
        }

    def _truncate(self, value: str | None, max_len: int) -> str:
        if not value:
            return ""
        clean = " ".join(value.split())
        return clean[:max_len]

    def _build_notes_prompt(self, source_text: str, exam_context: str | None) -> str:
        return (
            "Task: Convert the source news into exam-ready bullet notes.\n"
            "Rules:\n"
            "1) Use ONLY facts explicitly present in SOURCE.\n"
            "2) No hallucinations, no assumptions, no external knowledge.\n"
            "3) Each bullet must be maximum 30 words.\n"
            "4) Produce 4 to 6 bullets.\n"
            "5) For every bullet provide an evidence span copied exactly from SOURCE.\n"
            f"Exam context: {exam_context or 'General competitive exams'}\n"
            "Return JSON only using this schema:\n"
            "{\"bullet_points\":[{\"point\":\"...\",\"evidence\":\"exact quote from source\"}]}\n"
            f"SOURCE:\n{source_text}"
        )

    def _build_quiz_prompt(self, source_text: str) -> str:
        return (
            "Task: Create exactly 1 MCQ from SOURCE.\n"
            "Rules:\n"
            "1) Use ONLY SOURCE facts. No external facts.\n"
            "2) Return exactly 4 options.\n"
            "3) Exactly one option is correct.\n"
            "4) All options must be same-topic, conceptually close, and plausible.\n"
            "5) Do NOT copy labels like 'Title:', 'Description:', or 'Content:' into options.\n"
            "6) Answer must be one of options (exact text match).\n"
            "7) Keep the correct answer in a random option position (not always first).\n"
            "8) Explanation must be 70-130 words and refer only to SOURCE.\n"
            "9) Include evidence as an exact quote from SOURCE supporting the correct answer.\n"
            "Return JSON only with schema:\n"
            "{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"answer\":\"...\",\"explanation\":\"...\",\"evidence\":\"exact quote\"}\n"
            f"SOURCE:\n{source_text}"
        )

    def _validate_grounded_bullets(self, raw_points: object, source_text: str) -> list[str]:
        if not isinstance(raw_points, list):
            return []

        source_normalized = self._normalize_text(source_text)
        valid: list[str] = []
        seen = set()
        for item in raw_points:
            point = ""
            evidence = ""
            if isinstance(item, dict):
                point = str(item.get("point", "")).strip()
                evidence = str(item.get("evidence", "")).strip()
            elif isinstance(item, str):
                # When evidence is missing, we avoid trusting this output and let fallback handle it.
                continue

            if not point or not evidence:
                continue

            normalized_evidence = self._normalize_text(evidence)
            if not normalized_evidence or normalized_evidence not in source_normalized:
                continue

            point = self._truncate_words(point, 30)
            if len(point.split()) > 30:
                continue

            normalized_point = self._normalize_text(point)
            if normalized_point in seen:
                continue

            seen.add(normalized_point)
            valid.append(point)
            if len(valid) >= 6:
                break

        return valid

    def _extractive_bullets(self, source_text: str, max_points: int = 5) -> list[str]:
        # Deterministic fallback: extract and truncate source sentences only.
        sentences = re.split(r"(?<=[.!?])\s+", source_text)
        candidates = [self._normalize_sentence(sentence) for sentence in sentences if sentence and sentence.strip()]
        bullets: list[str] = []
        seen = set()
        for sentence in candidates:
            if not sentence:
                continue
            bullet = self._truncate_words(sentence, 30)
            normalized = self._normalize_text(bullet)
            if len(bullet.split()) < 5 or normalized in seen:
                continue
            seen.add(normalized)
            bullets.append(bullet)
            if len(bullets) >= max_points:
                break

        if not bullets:
            title_only = self._truncate_words(source_text, 30)
            bullets = [title_only]
        return bullets

    def _validate_grounded_quiz(self, raw_data: object, source_text: str) -> QuizQuestion | None:
        if not isinstance(raw_data, dict):
            return None

        question = str(raw_data.get("question", "")).strip()
        options = raw_data.get("options", [])
        answer = str(raw_data.get("answer", "")).strip()
        explanation = str(raw_data.get("explanation", "")).strip()
        evidence = str(raw_data.get("evidence", "")).strip()

        if not question or not isinstance(options, list) or len(options) != 4:
            return None

        normalized_options = [str(option).strip() for option in options]
        if any(not option for option in normalized_options):
            return None
        if any(self._looks_like_labeled_source(option) for option in normalized_options):
            return None

        if len(set(self._normalize_text(option) for option in normalized_options)) != 4:
            return None

        if answer not in normalized_options:
            return None

        normalized_source = self._normalize_text(source_text)
        normalized_evidence = self._normalize_text(evidence)
        if not normalized_evidence or normalized_evidence not in normalized_source:
            return None

        if len(question.split()) > 30:
            question = self._truncate_words(question, 30)
        explanation = self._build_detailed_explanation(
            explanation=explanation,
            answer=answer,
            options=normalized_options,
            evidence=evidence,
        )
        normalized_options, answer = self._shuffle_options(normalized_options, answer, question)

        try:
            return QuizQuestion(
                question=question,
                options=normalized_options,
                answer=answer,
                explanation=explanation,
            )
        except Exception:
            return None

    def _fallback_single_quiz(self, source_text: str) -> QuizQuestion:
        clean_source = self._clean_source_for_quiz(source_text)
        sentences = re.split(r"(?<=[.!?])\s+", clean_source)
        candidate = ""
        for item in sentences:
            sentence = self._normalize_sentence(item)
            if len(sentence.split()) >= 8:
                candidate = sentence
                break
        if not candidate:
            candidate = self._truncate_words(clean_source, 22)

        correct = self._build_correct_option_from_sentence(candidate)
        distractors = self._build_conceptual_distractors(candidate, correct)
        options = [correct, *distractors]
        options, answer = self._shuffle_options(options, correct, candidate)
        explanation = self._build_detailed_explanation(
            explanation="",
            answer=answer,
            options=options,
            evidence=self._truncate_words(candidate, 18),
        )
        return QuizQuestion(
            question="Which option best reflects the central point in the news update?",
            options=options,
            answer=answer,
            explanation=explanation,
        )

    def _build_correct_option_from_sentence(self, sentence: str) -> str:
        cleaned = self._normalize_sentence(sentence)
        cleaned = re.sub(r"\s+([.,!?])", r"\1", cleaned)
        cleaned = cleaned[0].upper() + cleaned[1:] if cleaned else cleaned
        cleaned = self._truncate_words(cleaned, 18)
        cleaned = re.sub(r"\s+([.,!?])", r"\1", cleaned).strip()
        if cleaned and not cleaned.endswith((".", "!", "?")):
            cleaned = f"{cleaned}."
        return cleaned

    def _build_conceptual_distractors(self, sentence: str, correct: str) -> list[str]:
        subject = self._extract_subject_phrase(sentence)
        focus = self._extract_focus_phrase(sentence)

        candidate_distractors = [
            f"{subject} announced only preliminary discussion, without any concrete rollout details.",
            f"{subject} shifted focus away from {focus} and treated it as a secondary issue.",
            f"{subject} described {focus} as a long-term idea, not part of the current update.",
            f"{subject} paused action on {focus} and deferred decisions to a later review.",
            f"{subject} addressed {focus} only as background context, not as the main announcement.",
        ]

        clean_correct = self._normalize_text(correct)
        unique: list[str] = []
        seen = {clean_correct}
        for option in candidate_distractors:
            normalized = self._normalize_text(option)
            if normalized in seen:
                continue
            seen.add(normalized)
            unique.append(self._truncate_words(option, 20))
            if len(unique) == 3:
                break

        if len(unique) < 3:
            fallback_distractors = [
                f"{subject} discussed related policy themes but did not confirm this specific development.",
                f"{subject} referenced the topic generally, without issuing this specific update.",
                f"{subject} highlighted background context but did not report this exact outcome.",
            ]
            for option in fallback_distractors:
                normalized = self._normalize_text(option)
                if normalized in seen:
                    continue
                seen.add(normalized)
                unique.append(self._truncate_words(option, 20))
                if len(unique) == 3:
                    break

        return unique

    def _extract_subject_phrase(self, sentence: str) -> str:
        cleaned = self._normalize_sentence(sentence)
        words = cleaned.split()
        if not words:
            return "The report"
        phrase = " ".join(words[: min(4, len(words))])
        phrase = phrase.strip(" ,.")
        if not phrase:
            return "The report"
        return phrase[0].upper() + phrase[1:]

    def _extract_focus_phrase(self, sentence: str) -> str:
        cleaned = self._normalize_sentence(sentence)
        words = [word.strip(" ,.") for word in cleaned.split() if word.strip(" ,.")]
        if len(words) <= 4:
            return "the key policy issue"
        focus_words = words[-4:]
        return " ".join(focus_words)

    def _clean_source_for_quiz(self, source_text: str) -> str:
        text = source_text
        text = re.sub(r"\bTitle:\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\bDescription:\s*", ". ", text, flags=re.IGNORECASE)
        text = re.sub(r"\bContent:\s*", ". ", text, flags=re.IGNORECASE)
        text = re.sub(r"\bSource:\s*", ". Source: ", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*\.\s*\.", ". ", text)
        text = " ".join(text.split())
        return text

    def _looks_like_labeled_source(self, option: str) -> bool:
        lowered = option.lower()
        return any(marker in lowered for marker in ("title:", "description:", "content:", "source:"))

    def _shuffle_options(self, options: list[str], answer: str, seed_value: str) -> tuple[list[str], str]:
        if answer not in options:
            return options, answer
        shuffled = options[:]
        seed = self._normalize_text(f"{seed_value}|{answer}|{','.join(options)}")
        random.Random(seed).shuffle(shuffled)
        # Ensure correct option is not predictably at first position.
        if shuffled[0] == answer:
            shuffled = shuffled[1:] + shuffled[:1]
        return shuffled, answer

    def _build_detailed_explanation(
        self,
        explanation: str,
        answer: str,
        options: list[str],
        evidence: str,
    ) -> str:
        base = " ".join(explanation.split())
        if len(base.split()) < 30:
            distractors = [option for option in options if option != answer]
            distractor_notes = []
            for option in distractors[:3]:
                note = self._truncate_words(option, 10)
                distractor_notes.append(f"'{note}' changes the claim beyond the source")
            joined_notes = "; ".join(distractor_notes)
            evidence_trimmed = self._truncate_words(evidence, 18)
            base = (
                f"The correct option is supported by the source statement: \"{evidence_trimmed}\". "
                f"This matches the reported event directly without adding assumptions. "
                f"The other options are incorrect because {joined_notes}. "
                "They sound related but alter the action, scope, or certainty given in the news text."
            )
        if len(base.split()) > 120:
            base = self._truncate_words(base, 120)
        return base

    def _format_bullets(self, bullets: list[str]) -> str:
        return "\n".join(f"- {bullet}" for bullet in bullets)

    def _normalize_sentence(self, sentence: str) -> str:
        sentence = " ".join(sentence.split())
        sentence = sentence.strip(" -")
        return sentence

    def _truncate_words(self, text: str, max_words: int) -> str:
        words = text.split()
        if len(words) <= max_words:
            return " ".join(words)
        return " ".join(words[:max_words])

    def _normalize_text(self, text: str) -> str:
        return " ".join(text.lower().split())

    def _news_source_text(self, article: NewsArticle) -> str:
        description_limit = min(700, max(200, settings.openai_source_max_chars // 3))
        content_limit = max(500, settings.openai_source_max_chars - description_limit)
        parts = [
            f"Title: {article.title}",
            f"Description: {self._truncate(article.description, description_limit)}",
            f"Content: {self._truncate(article.content, content_limit)}",
            f"Source: {article.source}",
        ]
        return "\n".join(parts)

    def _fallback_notes(self, article: NewsArticle, exam_context: str | None) -> str:
        source_text = self._news_source_text(article)
        bullets = self._extractive_bullets(source_text)
        return self._format_bullets(bullets)

    def _fallback_key_points(self, article: NewsArticle) -> list[str]:
        source_text = self._news_source_text(article)
        return self._extractive_bullets(source_text)

    def _fallback_quiz(self, article: NewsArticle, num_questions: int) -> list[QuizQuestion]:
        source_text = self._news_source_text(article)
        return [self._fallback_single_quiz(source_text)]

    def _load_json(self, raw: str, default: object) -> object:
        cleaned = raw.strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"(\{.*\}|\[.*\])", cleaned, flags=re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1))
                except json.JSONDecodeError:
                    return default
            return default


openai_service = OpenAIService()
