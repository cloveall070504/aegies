"""反向 RAG 评测套件测试基础设施。

提供自包含的内存 SQLite 会话（不碰开发库），自动建表并播种内置风险点，
供评测用例离线断言规则引擎的诚实性不变量。
"""
import os
import sys

# 把 backend/ 加入 sys.path，使 `import app` 可用
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401  确保全部模型在 Base.metadata 注册
from app.services.rag_service import RAGService


@pytest.fixture(scope="module")
def session():
    """内存 SQLite 会话：建表 + 播种内置风险点（idempotent）。"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    s = S()
    RAGService(s).seed_risk_points()
    yield s
    s.close()
