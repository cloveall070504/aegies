"""请求日志中间件：为每个请求生成/透传 X-Request-ID，并记录
method / path / status / 耗时（毫秒）。异常请求以 ERROR 落盘并带 request id，
便于跨日志串联排障。
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("app.middleware.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
        start = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:  # 交给全局异常处理器；这里先把上下文记下来
            logger.exception(
                "request failed rid=%s %s %s",
                rid, request.method, request.url.path,
            )
            raise
        dur_ms = (time.monotonic() - start) * 1000.0
        response.headers["X-Request-ID"] = rid
        logger.info(
            "rid=%s %s %s -> %d (%.1fms)",
            rid, request.method, request.url.path, response.status_code, dur_ms,
        )
        return response
