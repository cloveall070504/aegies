"""反向 RAG 升级 · E 方案（数据反哺闭环）验证。

覆盖：
  1) 扫描事件经 record_scan 落库（采集）；
  2) aggregate_misjudgments 聚合误判记录命中的高频风险关键词；
  3) suggest_risk_points 生成待审规则建议（去重、reviewed=0）；
  4) get_insights 统计概览；
  5) GET /api/v1/feedback/insights 教师可见 / 学生 403。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base
import app.models  # noqa: F401
from app.services.rag_service import RAGService
from app.core.deps import get_db, get_current_user
from app.models.user import User
from app.services import feedback_loop_service
from app.services.scan_service import analyze_text

import app.main as m

# 隔离 lifespan 真实 DB 副作用
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


def _override_teacher():
    return User(id=1, username="fb_teacher", role="teacher")


def _override_student():
    return User(id=2, username="fb_student", role="student")


m.app.dependency_overrides[get_db] = _override_db
m.app.dependency_overrides[get_current_user] = _override_teacher

client = TestClient(m.app)


@pytest.fixture(autouse=True)
def _force_teacher():
    m.app.dependency_overrides[get_current_user] = _override_teacher
    yield
    m.app.dependency_overrides[get_current_user] = _override_teacher


def _scan_and_flag(session, behavior="用嘴吸移液管中的腐蚀性试剂"):
    res = analyze_text(session, behavior, "chem_lab")
    rec = feedback_loop_service.record_scan(session, 1, behavior, res, "chem_lab")
    rec.is_misjudge = 1
    session.commit()
    return rec


def test_record_and_aggregate(session):
    _scan_and_flag(session)
    agg = feedback_loop_service.aggregate_misjudgments(session)
    kws = [a["keyword"] for a in agg]
    assert "用嘴吸" in kws  # _keyword_hits 命中该行为


def test_suggest_risk_points_and_dedup(session):
    _scan_and_flag(session)
    created = feedback_loop_service.suggest_risk_points(session, min_count=1)
    assert any(c["description"] == "用嘴吸" for c in created)
    assert all(c["reviewed"] == 0 and c["source"] == "custom" for c in created)
    # 再次建议应去重（候选已入 risk_points，不应重复生成）
    created2 = feedback_loop_service.suggest_risk_points(session, min_count=1)
    assert not any(c["description"] == "用嘴吸" for c in created2)


def test_get_insights(session):
    _scan_and_flag(session)
    ins = feedback_loop_service.get_insights(session)
    assert ins["misjudge_count"] >= 1
    assert "total_records" in ins
    assert "by_level" in ins
    assert "top_misjudge_keywords" in ins


def test_insights_teacher_ok():
    r = client.get("/api/v1/feedback/insights")
    assert r.status_code == 200, r.text
    assert "total_records" in r.json()["data"]


def test_insights_forbids_student():
    m.app.dependency_overrides[get_current_user] = _override_student
    try:
        r = client.get("/api/v1/feedback/insights")
        assert r.status_code == 403, r.text
    finally:
        m.app.dependency_overrides[get_current_user] = _override_teacher
