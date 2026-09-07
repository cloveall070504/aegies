"""反向 RAG 升级 · 关③验证：TestClient 走真实路由 /api/v1/scene/scan-text。

不触碰开发库：用内存库覆盖 get_db，并用 no-op 替换 lifespan 里的真实 DB 初始化与播种。
重点验证：
  1) 真实路由 HTTP 200；
  2) 返回体包含本次新增的 `trace`（方案4 溯源）与 `missing_steps`（方案1 缺失步骤）；
  3) 危险例句命中 high/medium 且带具体风险点；安全例句降级为 low 且不挂具体风险点（诚实不变量）。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
import app.models  # noqa: F401  注册全部模型到 Base.metadata
from app.services.rag_service import RAGService
from app.core.deps import get_db, get_current_user
from app.models.user import User
import app.main as m

# ── 隔离 lifespan 里的真实 DB 副作用（init_db / 默认账号 / 场景播种）──
m.init_db = lambda: None
m.seed_default_templates = lambda db: None
m._seed_scenes = lambda db: None
m._start_cleanup_task = lambda: None


class _NoopRAG:
    def __init__(self, db):
        pass

    def seed_risk_points(self):
        return None

    def search(self, *a, **k):
        return []


m.RAGService = _NoopRAG

# ── 内存库 + 播种内置风险点 ──
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(engine)
_Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _override_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


def _override_user():
    return User(id=1, username="gate3", role="student")


m.app.dependency_overrides[get_db] = _override_db
m.app.dependency_overrides[get_current_user] = _override_user

# 给内存库播种（路由里的 RAGService 是真实类，依赖这张内存表）
_seed = next(_override_db())
RAGService(_seed).seed_risk_points()
_seed.close()

client = TestClient(m.app)


def test_route_danger_has_trace_and_risk():
    r = client.post(
        "/api/v1/scene/scan-text",
        json={"text": "把水直接倒进浓硫酸里稀释", "scene_id": "chem_lab"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert "missing_steps" in data
    assert "findings" in data
    f = data["findings"][0]
    # 方案4：溯源字段就位
    assert "trace" in f
    assert f["trace"]["orig_level"] in ("high", "medium", "low", "none")
    assert isinstance(f["trace"]["ref_match_scores"], list)
    # 危险例句应当上报具体风险点
    assert f["level"] in ("high", "medium")
    assert len(f["all_risks"]) >= 1


def test_route_safe_low_and_no_specific_risk():
    r = client.post(
        "/api/v1/scene/scan-text",
        json={"text": "废液要回收到指定的废液桶里", "scene_id": "chem_lab"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    f = data["findings"][0]
    # 诚实不变量：正确处置句式判 low 且不挂具体风险点
    assert f["level"] == "low"
    assert len(f["all_risks"]) == 0
    # 溯源可见降级依据
    assert f["trace"]["safe_override"] is True


def test_route_missing_steps_present():
    # 缺少通风橱/护目镜等检查点的方案，应给出建议补充而非评级
    r = client.post(
        "/api/v1/scene/scan-text",
        json={"text": "取少量氯化钠固体溶于水配制溶液", "scene_id": "chem_lab"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert isinstance(data["missing_steps"], list)
