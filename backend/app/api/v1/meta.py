"""引擎状态（所有登录用户可见）：诚实暴露当前是 AI 增强模式还是规则模式。

这是消除「名不副实」观感的核心接口：前端据此在全局常驻展示引擎模式，
不再把纯规则引擎伪装成 AI。任意登录角色都可访问（学生/教师/管理员均可见）。
"""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.services.rag_service import ollama_status
from app.utils.response import ok

router = APIRouter(prefix="/meta", tags=["引擎状态"])


@router.get("/engine-status")
def engine_status(_user: User = Depends(get_current_user)):
    """实时引擎模式：ai（Ollama 在线且模型就绪）/ rule（配置关闭、服务不可达或缺模型）。"""
    return ok(ollama_status())
