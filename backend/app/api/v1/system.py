"""系统管理接口（仅管理员）：用户/场景/题库/推演统计、AI 引擎配置状态。"""
from sqlalchemy import func

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user, require_roles
from app.core.ollama_runtime import list_models, set_active_model, get_active_model
from app.database import get_db
from app.models.assignment import AssignmentProgress
from app.models.operation_record import OperationRecord
from app.models.quiz_question import QuizQuestion
from app.models.scene import Scene
from app.models.user import User
from app.services.agent_service import RISK_KEYWORDS
from app.services.rag_service import list_ollama_model_names, ollama_status
from app.utils.response import ok

router = APIRouter(prefix="/admin", tags=["系统管理"])


class ModelSwitchRequest(BaseModel):
    model: str


@router.get("/system-info")
def system_info(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """系统总览：用户按角色计数、场景/题库/推演总数、AI 引擎配置。"""
    users = db.query(User).all()
    by_role = {}
    for u in users:
        by_role[u.role] = by_role.get(u.role, 0) + 1

    total_records = db.query(func.count(OperationRecord.id)).scalar() or 0
    total_scenes = db.query(func.count(Scene.id)).scalar() or 0
    total_questions = db.query(func.count(QuizQuestion.id)).scalar() or 0
    total_assignments = db.query(func.count(AssignmentProgress.id)).scalar() or 0

    _engine_status = ollama_status()

    return ok({
        "user_counts": by_role,
        "total_users": len(users),
        "total_records": total_records,
        "total_scenes": total_scenes,
        "total_questions": total_questions,
        "total_assignments": total_assignments,
        "enable_ollama": settings.ENABLE_OLLAMA,
        "ollama_model": settings.OLLAMA_MODEL,
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "engine_status": _engine_status,
        "engine_mode": _engine_status["mode"],
        "app_env": getattr(settings, "APP_ENV", "dev"),
        "risk_keywords": RISK_KEYWORDS,
    })


@router.get("/risk-rules")
def risk_rules(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """风险判定规则概览（仅管理员）：高/中/低危关键词清单。"""
    return ok({k: v for k, v in RISK_KEYWORDS.items()})


@router.get("/ollama-models")
def ollama_models(
    user: User = Depends(require_roles("admin")),
):
    """B1：可选的 Ollama 模型档位列表（含能力档位/硬件要求/是否已本地安装/当前是否活跃）。

    仅管理员可访问——模型切换属系统级配置，不应向学生/教师开放。
    """
    return ok({
        "active": get_active_model(),
        "provider": settings.AI_PROVIDER,
        "base_url": settings.OPENAI_API_BASE if settings.AI_PROVIDER == "cloud" else settings.OLLAMA_BASE_URL,
        "candidates": list_models(),
    })


@router.post("/ollama-models/switch")
def switch_ollama_model(
    payload: ModelSwitchRequest,
    user: User = Depends(require_roles("admin")),
):
    """B1：运行时切换活跃模型，无需重启后端。

    非法模型名返回 400；目标模型未在本地安装也返回 400 并提示执行 `ollama pull`，
    避免活跃模型指向缺失模型导致生成降级但徽章仍显示 AI 在线的"名不副实"问题。
    """
    try:
        new_model = set_active_model(payload.model)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if settings.AI_PROVIDER == "cloud":
        # cloud 下校验：密钥已配置（模型由云端服务端决定是否存在，本地无列表可比对）
        if not settings.OPENAI_API_KEY:
            set_active_model(settings.OPENAI_MODEL)  # 回滚，保持系统可用
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"尚未配置 OPENAI_API_KEY，无法启用云端 AI 增强模式。"
                    f"请在 backend/.env 填入密钥并重启后端，然后再次切换。"
                ),
            )
    else:
        if payload.model not in list_ollama_model_names():
            # 回滚到默认模型，保持系统可用
            default_model = settings.OLLAMA_MODELS[0] if settings.OLLAMA_MODELS else "qwen2.5:3b"
            set_active_model(default_model)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"模型 {payload.model} 未在本地 Ollama 中安装，"
                    f"无法启用 AI 增强模式。请先执行 `ollama pull {payload.model}`，"
                    f"然后再切换。已自动回滚到默认模型 {default_model}。"
                ),
            )
    return ok({"active": new_model, "engine_status": ollama_status()})
