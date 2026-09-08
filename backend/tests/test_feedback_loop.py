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


class _NoopRAG:
    def __init__(self, db):
        pass

    def seed_risk_points(self):
        return None

    def search(self, *a, **k):
        return []


# 注：app.main 的 init_db / RAGService 等全局 mock 已下放到 _isolate_app_deps fixture
# （用例级生效、teardown 还原），避免收集期污染全局 app 单例拖垮 test_api 等真实 lifespan 用例。

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


client = TestClient(m.app)


@pytest.fixture(autouse=True)
def _isolate_app_deps():
    """用例级隔离对 app.main 全局 mock 与依赖覆盖。

    原先这些 mock（`init_db`/`RAGService` 等）与 `dependency_overrides` 写在模块级，
    pytest 收集期即对所有测试生效，会把依赖真实 lifespan 建表+种子的 test_api 等用例
    的 `get_db` 指向空内存库，导致 `no such table`。改为进入用例时打 mock、退出时还原
    原函数并清理覆盖，模块间互不污染。
    """
    import app.main as m

    saved_main = {
        n: getattr(m, n)
        for n in ("init_db", "seed_default_templates", "_seed_scenes", "_start_cleanup_task", "RAGService")
    }
    m.init_db = lambda: None
    m.seed_default_templates = lambda db: None
    m._seed_scenes = lambda db: None
    m._start_cleanup_task = lambda: None
    m.RAGService = _NoopRAG

    saved_ov = {
        get_db: m.app.dependency_overrides.get(get_db),
        get_current_user: m.app.dependency_overrides.get(get_current_user),
    }
    m.app.dependency_overrides[get_db] = _override_db
    m.app.dependency_overrides[get_current_user] = _override_teacher

    yield

    for n, v in saved_main.items():
        setattr(m, n, v)
    for dep, v in saved_ov.items():
        if v is None:
            m.app.dependency_overrides.pop(dep, None)
        else:
            m.app.dependency_overrides[dep] = v


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
