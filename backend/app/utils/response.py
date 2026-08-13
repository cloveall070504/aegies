"""统一响应格式：{code, message, data, timestamp}"""
from datetime import datetime, timezone


def ok(data=None, message: str = "success", code: int = 200):
    return {
        "code": code,
        "message": message,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def fail(message: str = "error", code: int = 400, data=None):
    return {
        "code": code,
        "message": message,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
