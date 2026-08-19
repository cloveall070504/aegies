"""后端统一启动入口（推荐）。

读取环境变量决定绑定地址/端口/日志级别，并启用项目自带的日志配置：
  HOST        默认 127.0.0.1（本地开发）；容器部署设 0.0.0.0
  PORT        默认 8001（与本地开发/登录自启一致）；容器设 8000
  LOG_LEVEL   默认 INFO

用法：
  开发/登录自启：python start.py
  Docker：      docker 内设置 HOST=0.0.0.0 PORT=8000 后 python start.py
"""
from __future__ import annotations

import os

from app.core.logging_config import configure_logging

configure_logging()

import uvicorn  # noqa: E402

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8001"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").lower()


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        log_level=LOG_LEVEL,
        log_config=None,  # 由 configure_logging() 统一接管日志
        reload=False,
    )
