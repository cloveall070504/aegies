"""多实例就绪的缓存抽象层。

问题背景（架构/运维 P1）：
- 原 ollama 状态缓存、限流计数都放在进程内 dict，单实例可用；
- 一旦水平扩展（多 uvicorn 实例），各实例状态不一致，且重启即丢。

解决：抽出 `CacheStore` 接口，默认 `MemoryCacheStore`（线程安全、零依赖、
行为与原 dict 缓存一致，保证现有测试与本地运行不受影响）；当配置了
`REDIS_URL` 时自动切换到 `RedisCacheStore`，限流/引擎缓存/会话即可跨实例共享。
"""
import json
import os
import threading
import time
from typing import Any, Optional


class CacheStore:
    """极简键值缓存接口（带可选 TTL）。"""

    def get(self, key: str) -> Any | None:  # pragma: no cover - 抽象方法
        raise NotImplementedError

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:  # pragma: no cover
        raise NotImplementedError

    def delete(self, key: str) -> None:  # pragma: no cover
        raise NotImplementedError


class MemoryCacheStore(CacheStore):
    """进程内缓存：线程安全、支持 TTL。单实例/开发默认后端。"""

    def __init__(self) -> None:
        self._values: dict[str, Any] = {}
        self._expires: dict[str, float | None] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            if key not in self._values:
                return None
            exp = self._expires.get(key)
            if exp is None or exp > time.monotonic():
                return self._values[key]
            # 已过期：惰性清理
            self._values.pop(key, None)
            self._expires.pop(key, None)
            return None

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        with self._lock:
            self._values[key] = value
            self._expires[key] = None if ttl is None else time.monotonic() + ttl

    def delete(self, key: str) -> None:
        with self._lock:
            self._values.pop(key, None)
            self._expires.pop(key, None)


class RedisCacheStore(CacheStore):
    """Redis 后端：跨实例共享。值以 JSON 序列化（redis 仅存字符串/字节）。

    仅当环境变量 `REDIS_URL` 设置时才会被选用；redis 库为懒加载，
    未安装时 `get_cache_store()` 会自动回退到内存，不会因此崩溃。
    """

    def __init__(self, url: str) -> None:
        import redis  # 懒加载：默认路径不依赖 redis

        self._r = redis.Redis.from_url(
            url, socket_timeout=2, socket_connect_timeout=2, decode_responses=True
        )

    def get(self, key: str) -> Any | None:
        raw = self._r.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        self._r.set(key, json.dumps(value, ensure_ascii=False), ex=int(ttl) if ttl else None)

    def delete(self, key: str) -> None:
        self._r.delete(key)


_CACHE: Optional[CacheStore] = None
_CACHE_LOCK = threading.Lock()


def get_cache_store() -> CacheStore:
    """返回全局缓存单例：有 REDIS_URL 优先 Redis（失败回退内存），否则内存。"""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    with _CACHE_LOCK:
        if _CACHE is not None:
            return _CACHE
        url = os.getenv("REDIS_URL")
        if url:
            try:
                _CACHE = RedisCacheStore(url)
                return _CACHE
            except Exception:
                # Redis 不可用（未装库/连不上）→ 静默回退内存，保证服务可起。
                pass
        _CACHE = MemoryCacheStore()
        return _CACHE
