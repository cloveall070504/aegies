"""全局配置：Ollama 地址、数据库连接、JWT 密钥等。"""
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    APP_NAME: str = "AI实操避错系统"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True

    # 数据库（SQLite，启动时自动建表）
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'ai_avoid_error.db'}"

    # JWT
    SECRET_KEY: str = "chy07-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # Ollama 本地大模型
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"

    # Chroma 向量库
    CHROMA_PERSIST_DIR: str = str(BASE_DIR / "data" / "chroma")
    EMBEDDING_MODEL: str = "BAAI/bge-small-zh-v1.5"

    # 上传文档存储目录
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")

    # 报告输出目录
    REPORT_DIR: str = str(BASE_DIR / "data" / "reports")

    # 双智能体开关（Ollama 不可用时降级为规则引擎）
    ENABLE_OLLAMA: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# 确保必要目录存在
for _d in (settings.CHROMA_PERSIST_DIR, settings.UPLOAD_DIR, settings.REPORT_DIR):
    Path(_d).mkdir(parents=True, exist_ok=True)
