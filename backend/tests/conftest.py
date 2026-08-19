"""pytest 共享 fixture：把"临时冒烟脚本"升级为"正规 pytest 框架"。

设计要点：
- 使用 FastAPI ``TestClient`` 在进程内启动应用，无需手动先起后端服务；
- 通过环境变量把 ``DATABASE_URL`` 指向一个隔离的**内存 SQLite 库**
  （``sqlite:///:memory:`` + StaticPool 单连接共享），``lifespan`` 启动钩子自动执行
  Alembic 建表 + 种子数据，因此：
    * 不会污染开发库（ai_avoid_error.db）；
    * 不会产生 SQLite 文件锁（Windows 下文件型测试库常因残留锁无法删除）；
    * CI 中离线、无外部依赖即可运行；
- ``ENABLE_OLLAMA=false`` 强制走规则引擎降级，避免 CI 访问本地大模型。
"""
import os

# ---- 必须在 import app 之前设置，注入隔离的测试数据库 ----
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["ENABLE_OLLAMA"] = "false"
os.environ["APP_TEST"] = "1"  # 关闭 SQLite WAL（内存库无需 WAL，文件库保持默认）
os.environ["RATE_LIMIT_ENABLED"] = "false"  # 测试不做限流，避免单 session 累计触发 429

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    """进程内启动应用（触发 Alembic 建表 + 种子），返回 TestClient。

    通过 base_url 统一注入 /api/v1 前缀，使测试用例可用相对路径
    （/auth/login 等），与路由注册前缀保持一致。
    """
    with TestClient(app, base_url="http://testserver/api/v1/") as c:
        yield c
    # 内存库无需清理文件；仅确保连接释放。
    try:
        from app.database import engine
        engine.dispose()
    except Exception:
        pass


@pytest.fixture
def ts():
    import time
    return str(int(time.time() * 1000))


def _login(client, username, password):
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['data']['token']}"}


@pytest.fixture
def admin_headers(client):
    return _login(client, "admin", "admin123")


@pytest.fixture
def teacher_headers(client):
    return _login(client, "teacher", "123456")


@pytest.fixture
def student_headers(client):
    return _login(client, "student", "123456")


@pytest.fixture
def new_student(client, ts):
    """注册并登录一个全新学生，返回 (token, headers, username)。"""
    uname = f"stu_{ts}"
    r = client.post("/auth/register", json={
        "username": uname, "password": "pass1234",
        "display_name": "测试学生", "department": "测试系", "role": "admin",
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user"]["role"] == "student", "自注册必须被强制为 student"
    token = r.json()["data"]["token"]
    return token, {"Authorization": f"Bearer {token}"}, uname
