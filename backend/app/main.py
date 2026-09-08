"""实战避错系统 · FastAPI 应用入口

启动：uvicorn app.main:app --reload --port 8001
"""
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import (assignment, auth, avatar, cases, coach, companion, dashboard, docs,
                        feedback, meta, org, profile, quiz, report, risk_point, rules,
                        scenario, scan, scene_system, simulation, system, telemetry, tts)
from app.config import settings
from app.core.request_log import RequestLoggingMiddleware
from app.core.ratelimit import RateLimitMiddleware
from app.core.security import hash_password
from app.database import engine, init_db, SessionLocal
from app.models.user import User
from app.services.prompt_service import seed_default_templates
from app.services.rag_service import RAGService, ollama_status
from app.api.v1.scene_system import _seed_scenes
from app.api.v1.companion import _start_cleanup_task

# 默认账号（首次启动写入，幂等）
DEFAULT_ACCOUNTS = [
    ("admin", "admin123", "admin", "教务处", "系统管理员"),
    ("student", "123456", "student", "化工实验1班", "演示学生"),
    ("teacher", "123456", "teacher", "化学实验中心", "实验教师"),
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化数据库并写入种子数据。

    取代已废弃的 @app.on_event("startup")，符合 FastAPI 当前推荐写法。
    """
    init_db()
    db = SessionLocal()
    try:
        # 种子数据：Prompt 模板 + 内置风险点 + 场景+步骤
        seed_default_templates(db)
        RAGService(db).seed_risk_points()
        _seed_scenes(db)
        # 默认账号
        for username, pwd, role, dept, display in DEFAULT_ACCOUNTS:
            if not db.query(User).filter(User.username == username).first():
                db.add(User(username=username, password_hash=hash_password(pwd),
                            role=role, department=dept, display_name=display))
        db.commit()
    finally:
        db.close()
    # 启动后台定时清理任务（会话过期回收，防内存泄漏）
    _start_cleanup_task()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="实战避错系统 —— 基于反向RAG与双智能体校验的沉浸式风险实训平台",
    version="1.0.0",
    lifespan=lifespan,
)

# 健康探测复用 ollama_status() 的 15s 缓存（见 rag_service），避免每次探测都发起慢速网络请求
def _ollama_component_status() -> str:
    try:
        st = ollama_status()
        return "ok" if st.get("reachable") else f"unreachable: {st.get('reason', '')}"
    except Exception as exc:  # noqa: BLE001
        return f"unreachable: {exc}"

# CORS：开发环境允许 localhost，生产环境通过 CORS_ORIGINS 环境变量配置
_cors_env = os.getenv("CORS_ORIGINS", "")
if _cors_env:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    _cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173",
                     "http://localhost:4173", "http://127.0.0.1:4173",
                     "http://localhost:5174", "http://127.0.0.1:5174",
                     "http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 运维可观测性：请求日志（外层，记录含被限流在内的所有请求）
app.add_middleware(RequestLoggingMiddleware)
# 安全防护：按 IP+路径滑动窗口限流（内层，尽早拒绝超限请求）
app.add_middleware(RateLimitMiddleware)

# 统一 /api/v1 前缀注册路由
api_v1 = [
    auth.router,
    avatar.router,
    companion.router,
    dashboard.router,
    scenario.router,
    profile.router,
    scan.router,
    cases.router,
    coach.router,
    docs.router,
    quiz.router,
    report.router,
    org.router,
    scene_system.router,
    assignment.router,
    simulation.router,
    system.router,
    meta.router,
    risk_point.router,
    rules.router,
    feedback.router,
    tts.router,
    telemetry.router,
]
for r in api_v1:
    app.include_router(r, prefix=settings.API_V1_PREFIX)


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "docs": "/docs",
        "api_prefix": settings.API_V1_PREFIX,
        "message": "实战避错系统后端已启动",
    }


@app.get("/api/v1/health")
def health():
    """深度健康检查：探测数据库与 Ollama 可达性，便于监控与容器探针。

    返回字段在原有 code/message/data 基础上扩展：
      data.status      整体状态 ok / degraded
      data.components  各依赖组件状态（database / ollama）
    未接入 Ollama（规则引擎模式）时 ollama 为 unreachable 属正常，不影响整体 ok。
    """
    components: dict[str, str] = {}

    # 数据库连通性
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        components["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        components["database"] = f"error: {exc}"

    # Ollama 可达性：复用带缓存的探测（短 TTL），避免每次健康探测都发起慢速网络请求
    components["ollama"] = _ollama_component_status()

    overall = "ok" if components.get("database") == "ok" else "degraded"
    return {
        "code": 200,
        "message": "ok",
        "data": {
            "status": overall,
            "components": components,
            "timestamp": datetime.now().isoformat(),
        },
    }
