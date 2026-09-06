"""轻量内存限流中间件（无额外依赖）。

按 `客户端IP + 路径前缀` 做 60 秒滑动窗口限流，防爆破 / 防滥用。
- 登录等敏感接口更严格；扫描/推演类次之；其余走全局上限。
- 健康检查与文档接口豁免。
- 生产环境建议把 _STORE 换成 Redis 后端（按 IP 维度共享）。

路径前缀与上限（每分钟请求数）可在 DEFAULT_LIMITS 调整。
"""
from __future__ import annotations

import time
from collections import deque
from typing import Dict, Deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse

from app.config import settings

# (路径前缀, 每分钟上限)
DEFAULT_LIMITS = [
    ("/api/v1/auth/login", 10),
    # TTS 每次请求会 fork 一个 edge-tts 子进程，成本高，限得更严
    ("/api/v1/tts", 20),
    ("/api/v1/scene", 120),
    ("/api/v1/simulate", 60),
    ("/api/v1/meta/engine-status", 120),
]
GLOBAL_LIMIT = 360
_WINDOW = 60.0  # 秒
_MAX_KEYS = 20000  # 内存保护：唯一 IP+前缀 key 上限

_STORE: Dict[str, Deque[float]] = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limits=None, global_limit: int = GLOBAL_LIMIT):
        super().__init__(app)
        self.limits = limits or DEFAULT_LIMITS
        self.global_limit = global_limit
        self.enabled = settings.RATE_LIMIT_ENABLED

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self.enabled:
            return await call_next(request)
        path = request.url.path
        if path.startswith(("/health", "/api/v1/health", "/docs",
                             "/openapi.json", "/redoc")):
            return await call_next(request)

        ip = _client_ip(request)
        now = time.monotonic()
        matched = "__global__"
        limit = self.global_limit
        for prefix, lim in self.limits:
            if path.startswith(prefix):
                matched, limit = prefix, lim
                break

        key = f"{ip}|{matched}"
        q = _STORE.get(key)
        if q is None:
            if len(_STORE) >= _MAX_KEYS:
                # 简单保护：超限时丢弃最早写入的 key
                try:
                    _STORE.pop(next(iter(_STORE)))
                except StopIteration:
                    pass
            q = _STORE.setdefault(key, deque())
        while q and now - q[0] > _WINDOW:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse(
                status_code=429,
                content={"code": 429, "message": "请求过于频繁，请稍后再试", "data": None},
                headers={"Retry-After": "60"},
            )
        q.append(now)
        return await call_next(request)
