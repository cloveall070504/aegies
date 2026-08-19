"""统一响应格式：{code, message, data, timestamp}

成功：HTTP 200 + body.code=200
失败：HTTP 状态码 = code（400/403/404 等），body 保持同样格式
前端 axios 拦截器在 error 分支读 err.response.data.message 即可兼容。
"""
from datetime import datetime, timezone

from fastapi.responses import JSONResponse


def ok(data=None, message: str = "success", code: int = 200):
    return {
        "code": code,
        "message": message,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def fail(message: str = "error", code: int = 400, data=None):
    """失败响应：同时设置 HTTP 状态码与 body.code，兼容旧前端拦截器。"""
    return JSONResponse(
        status_code=code,
        content={
            "code": code,
            "message": message,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
