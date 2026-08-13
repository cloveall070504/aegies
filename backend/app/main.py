"""AI实操避错系统 · FastAPI 应用入口

启动：uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (auth, cases, dashboard, docs, org, profile, quiz,
                        report, scenario, scan)
from app.config import settings
from app.core.security import hash_password
from app.database import init_db
from app.models.user import User
from app.services.prompt_service import seed_default_templates
from app.services.rag_service import RAGService
from app.database import SessionLocal

app = FastAPI(
    title=settings.APP_NAME,
    description="AI实操避错系统 —— 基于反向RAG与双智能体校验的沉浸式风险实训平台",
    version="1.0.0",
)

# CORS：允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 统一 /api/v1 前缀注册路由
api_v1 = [
    auth.router,
    dashboard.router,
    scenario.router,
    profile.router,
    scan.router,
    cases.router,
    docs.router,
    quiz.router,
    report.router,
    org.router,
]
for r in api_v1:
    app.include_router(r, prefix=settings.API_V1_PREFIX)


@app.on_event("startup")
def on_startup():
    init_db()
    db = SessionLocal()
    try:
        # 种子数据：Prompt 模板 + 内置风险点
        seed_default_templates(db)
        RAGService(db).seed_risk_points()
        # 默认账号
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(username="admin", password_hash=hash_password("admin123"),
                        role="admin", department="教务处", display_name="系统管理员"))
        if not db.query(User).filter(User.username == "student").first():
            db.add(User(username="student", password_hash=hash_password("123456"),
                        role="student", department="化工实验1班", display_name="演示学生"))
        if not db.query(User).filter(User.username == "worker").first():
            db.add(User(username="worker", password_hash=hash_password("123456"),
                        role="worker", department="机加车间A组", display_name="演示工人"))
        db.commit()
    finally:
        db.close()


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "docs": "/docs",
        "api_prefix": settings.API_V1_PREFIX,
        "message": "AI实操避错系统后端已启动",
    }


@app.get("/api/v1/health")
def health():
    return {"code": 200, "message": "ok", "data": {"status": "running"}, "timestamp": __import__("datetime").datetime.now().isoformat()}
