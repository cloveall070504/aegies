"""CacheStore 抽象层测试：覆盖内存后端 TTL 行为与工厂默认（无 Redis 时回退内存）。"""
import os
import time

from app.core.cache import CacheStore, MemoryCacheStore, RedisCacheStore, get_cache_store


def test_memory_set_get_delete():
    s: CacheStore = MemoryCacheStore()
    assert s.get("missing") is None
    s.set("k", {"a": 1})
    assert s.get("k") == {"a": 1}
    s.delete("k")
    assert s.get("k") is None


def test_memory_ttl_expires():
    s: CacheStore = MemoryCacheStore()
    s.set("k", "v", ttl=0.2)
    assert s.get("k") == "v"
    time.sleep(0.35)
    assert s.get("k") is None  # 过期后返回 None


def test_memory_ttl_none_never_expires():
    s: CacheStore = MemoryCacheStore()
    s.set("k", "v")  # 无 ttl
    time.sleep(0.05)
    assert s.get("k") == "v"


def test_factory_defaults_to_memory_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    # 重置模块级单例，确保从环境变量重新决策
    import app.core.cache as cache_mod

    monkeypatch.setattr(cache_mod, "_CACHE", None)
    store = get_cache_store()
    assert isinstance(store, MemoryCacheStore)
    assert not isinstance(store, RedisCacheStore)


def test_factory_returns_same_singleton(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    import app.core.cache as cache_mod

    monkeypatch.setattr(cache_mod, "_CACHE", None)
    assert get_cache_store() is get_cache_store()
