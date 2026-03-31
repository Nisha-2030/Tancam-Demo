import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime
from decimal import Decimal
from typing import Any, Awaitable, Callable

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover - optional dependency
    Redis = None


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return str(value)


def make_cache_key(namespace: str, payload: Any) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=_json_default)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{namespace}:{digest}"


class InMemoryCacheBackend:
    def __init__(self, max_items: int = 2000) -> None:
        self._max_items = max(100, max_items)
        self._store: dict[str, tuple[float, str]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> str | None:
        now = time.monotonic()
        async with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if expires_at <= now:
                self._store.pop(key, None)
                return None
            return value

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        expires_at = time.monotonic() + max(1, ttl_seconds)
        async with self._lock:
            self._store[key] = (expires_at, value)
            if len(self._store) <= self._max_items:
                return
            # Quick cleanup: remove expired first.
            now = time.monotonic()
            expired = [store_key for store_key, (ttl, _) in self._store.items() if ttl <= now]
            for store_key in expired:
                self._store.pop(store_key, None)
            # If still over capacity, drop oldest inserted keys.
            overflow = len(self._store) - self._max_items
            if overflow > 0:
                for store_key in list(self._store.keys())[:overflow]:
                    self._store.pop(store_key, None)

    async def close(self) -> None:
        async with self._lock:
            self._store.clear()


class RedisCacheBackend:
    def __init__(self, redis_url: str, key_prefix: str) -> None:
        if Redis is None:
            raise RuntimeError("redis package is not installed")
        self._prefix = key_prefix
        self._client = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)

    async def get(self, key: str) -> str | None:
        return await self._client.get(self._prefixed(key))

    async def set(self, key: str, value: str, ttl_seconds: int) -> None:
        await self._client.set(self._prefixed(key), value, ex=max(1, ttl_seconds))

    async def close(self) -> None:
        await self._client.aclose()

    def _prefixed(self, key: str) -> str:
        return f"{self._prefix}{key}"


class CacheService:
    def __init__(self) -> None:
        self._backend = self._build_backend()
        self._singleflight_locks: dict[str, asyncio.Lock] = {}
        self._lock_guard = asyncio.Lock()

    def _build_backend(self) -> InMemoryCacheBackend | RedisCacheBackend:
        backend = settings.cache_backend.strip().lower()
        if backend == "redis" and settings.redis_url:
            try:
                logger.info("Using Redis cache backend.")
                return RedisCacheBackend(settings.redis_url, settings.redis_key_prefix)
            except Exception as exc:  # pragma: no cover - depends on runtime dependency and connectivity
                logger.warning("Redis cache unavailable, falling back to memory cache: %s", exc)
        return InMemoryCacheBackend(max_items=settings.cache_max_items)

    async def get_json(self, key: str) -> Any | None:
        try:
            raw = await self._backend.get(key)
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Cache read failed for key %s: %s", key, exc)
            return None

    async def set_json(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        ttl = ttl_seconds if ttl_seconds is not None else settings.cache_default_ttl_seconds
        try:
            raw = json.dumps(value, separators=(",", ":"), default=_json_default)
            await self._backend.set(key, raw, ttl)
        except Exception as exc:
            logger.warning("Cache write failed for key %s: %s", key, exc)

    async def get_or_set_json(
        self,
        key: str,
        ttl_seconds: int,
        producer: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, bool]:
        cached = await self.get_json(key)
        if cached is not None:
            return cached, True

        lock = await self._singleflight_lock(key)
        async with lock:
            cached = await self.get_json(key)
            if cached is not None:
                return cached, True
            value = await producer()
            await self.set_json(key, value, ttl_seconds=ttl_seconds)
            return value, False

    async def close(self) -> None:
        try:
            await self._backend.close()
        except Exception as exc:
            logger.warning("Cache backend close failed: %s", exc)

    async def _singleflight_lock(self, key: str) -> asyncio.Lock:
        async with self._lock_guard:
            lock = self._singleflight_locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._singleflight_locks[key] = lock
            return lock


cache_service = CacheService()

