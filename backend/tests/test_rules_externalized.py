"""反向 RAG 升级 · C 方案（规则外置）验证。

覆盖：
  1) 内置默认规则经 rules_store 加载，且补缺口短语（徒手拿热蒸发皿等）已并入；
  2) 自定义规则增删持久化（写盘后 reload 仍生效）+ 与内置默认并集生效；
  3) 引擎判定（_safe_context_override / _is_prohibition_statement）确实走 rules_store；
  4) 接口 /api/v1/rules 的 GET/POST/DELETE 与 teacher 角色鉴权。
不破坏「诚实不变量」与既有 31 测试。
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
from app.services import rules_store, agent_service

import app.main as m

# ── 隔离 lifespan 真实 DB 副作用 ──
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
    return User(id=1, username="rule_teacher", role="teacher")


def _override_student():
    return User(id=2, username="rule_student", role="student")


m.app.dependency_overrides[get_db] = _override_db
m.app.dependency_overrides[get_current_user] = _override_teacher

_seed = next(_override_db())
RAGService(_seed).seed_risk_points()
_seed.close()

client = TestClient(m.app)


@pytest.fixture(autouse=True)
def _setup_teacher_and_restore_store():
    # 强制 teacher 角色，消除与 test_scan_route_third_gate 共享 app 实例时
    # get_current_user override 的加载顺序不确定性。
    saved_path = rules_store.RULES_PATH
    m.app.dependency_overrides[get_current_user] = _override_teacher
    yield
    m.app.dependency_overrides[get_current_user] = _override_teacher
    rules_store.RULES_PATH = saved_path
    rules_store.reload(saved_path)


# ── 1) 默认规则加载 + 补缺口 ──
def test_default_rules_loaded_and_gap_filled():
    hd = rules_store.get_hard_danger()
    # 已知内置危险短语
    assert "用嘴吸" in hd
    # 补规则缺口：徒手/裸手接触热的蒸发皿、徒手取固体药品
    assert "徒手拿热蒸发皿" in hd
    assert "徒手抓固体" in hd
    # 反向：裸「热蒸发皿」不应误伤正确操作（未加入默认）
    assert "热蒸发皿" not in hd


# ── 2) 自定义增删 + 持久化 + 并集 ──
def test_custom_term_add_remove_and_persist(tmp_path):
    p = str(tmp_path / "safety_rules.json")
    rules_store.reload(p)
    rules_store.add_term("hard_danger", "自定义危险短语XYZ", p)
    assert "自定义危险短语XYZ" in rules_store.get_hard_danger()
    # 持久化：重新加载文件后仍在
    rules_store.reload(p)
    assert "自定义危险短语XYZ" in rules_store.get_hard_danger()
    # 与内置默认并集
    assert "用嘴吸" in rules_store.get_hard_danger()
    # 删除自定义项
    rules_store.remove_term("hard_danger", "自定义危险短语XYZ", p)
    assert "自定义危险短语XYZ" not in rules_store.get_hard_danger()


# ── 3) 引擎确实走 rules_store（外置生效）──
def test_engine_uses_externalized_hard_danger():
    # 补缺口短语经 rules_store 被识别为硬危险：即便提了护目镜也不降级
    lvl = agent_service._safe_context_override("戴好护目镜徒手拿热蒸发皿", "high")
    assert lvl == "high"
    # 内置默认硬危险仍生效
    assert agent_service._safe_context_override("用嘴通过移液管吸取试剂", "high") == "high"


def test_engine_uses_externalized_prohibit_and_safe_verbs():
    # 禁止词经 rules_store
    assert agent_service._is_prohibition_statement("禁止把水倒进浓硫酸")
    # 安全动词经 rules_store（默认含「关闭」「熄灭」）
    assert agent_service._safe_context_override("关闭酒精灯并确认无明火", "high") == "low"


# ── 4) 接口 CRUD + 角色鉴权 ──
def test_rules_api_get_lists_effective():
    r = client.get("/api/v1/rules")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "hard_danger" in data
    assert "effective" in data["hard_danger"]
    assert "用嘴吸" in data["hard_danger"]["effective"]


def test_rules_api_add_delete_requires_teacher(tmp_path):
    rules_store.RULES_PATH = str(tmp_path / "r.json")
    rules_store.reload(rules_store.RULES_PATH)

    # teacher 添加
    r = client.post("/api/v1/rules", json={"scope": "hard_danger", "term": "接口新增危险A"})
    assert r.status_code == 200, r.text
    assert "接口新增危险A" in r.json()["terms"]

    # 重新 GET 可见（并集）
    g = client.get("/api/v1/rules")
    assert "接口新增危险A" in g.json()["hard_danger"]["effective"]

    # 删除
    d = client.delete("/api/v1/rules", params={"scope": "hard_danger", "term": "接口新增危险A"})
    assert d.status_code == 200
    assert "接口新增危险A" not in d.json()["terms"]


def test_rules_api_forbids_student():
    m.app.dependency_overrides[get_current_user] = _override_student
    try:
        r = client.get("/api/v1/rules")
        assert r.status_code == 403, r.text
    finally:
        m.app.dependency_overrides[get_current_user] = _override_teacher
