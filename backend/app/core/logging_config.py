"""集中式日志配置：控制台 + 按大小滚动的文件日志。

通过环境变量驱动（均可选，有默认值）：
  LOG_LEVEL      日志级别，默认 INFO（DEBUG/INFO/WARNING/ERROR）
  LOG_DIR        日志目录，默认 <backend>/logs
  LOG_MAX_BYTES  单文件上限，默认 10MB
  LOG_BACKUPS    保留历史文件数，默认 5
  LOG_TO_FILE    是否写文件日志，默认 true；设为 false 仅输出控制台
                （容器/无持久化环境推荐 false，日志走 stdout 由编排层收集）

用法：在进程入口（start.py）最早调用 configure_logging()，
之后项目内任何模块用标准 logging 即可获得统一格式与落盘。
"""
from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import BASE_DIR, settings

LOG_FORMAT = (
    "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
)


def configure_logging() -> None:
    """配置 root logger：控制台 + 滚动文件。幂等（重复调用不会叠加 handler）。"""
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

    log_dir = Path(os.getenv("LOG_DIR", str(BASE_DIR / "logs")))
    log_dir.mkdir(parents=True, exist_ok=True)
    max_bytes = int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024)))
    backups = int(os.getenv("LOG_BACKUPS", "5"))

    root = logging.getLogger()
    root.setLevel(level)
    for h in list(root.handlers):
        root.removeHandler(h)

    fmt = logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root.addHandler(console)

    # 是否写文件日志：容器/无持久化环境可设 LOG_TO_FILE=false 仅输出控制台。
    log_to_file = os.getenv("LOG_TO_FILE", "true").lower() not in ("0", "false", "no")
    file_handler = None
    if log_to_file:
        file_handler = RotatingFileHandler(
            log_dir / "app.log",
            maxBytes=max_bytes,
            backupCount=backups,
            encoding="utf-8",
        )
        file_handler.setFormatter(fmt)
        root.addHandler(file_handler)

    # 让 app.* 自带 handler 并关闭向上传播：避免被第三方库改动 root 传播/级别
    # 导致业务日志丢失（实测 uvicorn.error 仍能经 root 落盘，但 app 子 logger 偶发丢记录）。
    app_log = logging.getLogger("app")
    app_log.setLevel(level)
    app_log.propagate = False
    for h in list(app_log.handlers):
        app_log.removeHandler(h)
    app_log.addHandler(console)
    if file_handler is not None:
        app_log.addHandler(file_handler)

    # 第三方噪声降噪：避免访问日志刷屏、httpx 调试噪音
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("alembic").setLevel(logging.WARNING)

    logging.getLogger("app").info(
        "logging configured: level=%s dir=%s", logging.getLevelName(level), log_dir
    )
