from datetime import datetime, timezone


SOURCE_RELIABILITY_MAP = {
    "pib": 1.0,
    "press information bureau": 1.0,
    "reuters": 0.95,
    "associated press": 0.93,
    "bbc": 0.92,
    "the hindu": 0.90,
    "indian express": 0.88,
    "default": 0.60,
}
TRUSTED_SOURCE_THRESHOLD = 0.80
GOVERNMENT_SOURCES = {"pib", "press information bureau"}


def normalize_source(source: str) -> str:
    return source.lower().strip()


def source_reliability(source: str) -> float:
    normalized = normalize_source(source)
    return SOURCE_RELIABILITY_MAP.get(normalized, SOURCE_RELIABILITY_MAP["default"])


def is_government_source(source: str) -> bool:
    return normalize_source(source) in GOVERNMENT_SOURCES


def is_trusted_source(source: str) -> bool:
    return source_reliability(source) >= TRUSTED_SOURCE_THRESHOLD


def compute_source_reputation(source: str) -> float:
    # Backward-compatible wrapper used by ranking/trust code.
    return source_reliability(source)


def compute_recency_score(published_at: datetime) -> float:
    now = datetime.now(timezone.utc)
    age_days = max((now - published_at).days, 0)
    if age_days <= 1:
        return 1.0
    if age_days <= 3:
        return 0.8
    if age_days <= 7:
        return 0.6
    if age_days <= 30:
        return 0.4
    return 0.2


def compute_content_quality(content: str | None, description: str | None) -> float:
    text = (content or "") + " " + (description or "")
    length = len(text.strip())
    if length >= 1200:
        return 1.0
    if length >= 600:
        return 0.8
    if length >= 250:
        return 0.6
    if length >= 100:
        return 0.4
    return 0.2


def compute_consistency_score(url: str | None) -> float:
    return 0.9 if url else 0.5


def to_trust_level(score: float) -> str:
    if score >= 80:
        return "HIGH"
    if score >= 60:
        return "MEDIUM"
    return "LOW"
