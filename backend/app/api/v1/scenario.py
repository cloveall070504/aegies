"""场景推演接口：行为输入 → 双智能体校验 + 风险打分 + 条款溯源。"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user
from app.database import get_db
from app.models.case_entry import CaseEntry
from app.models.operation_record import OperationRecord
from app.models.user import User
from app.schemas import ScenarioInferRequest
from app.services.agent_service import AgentService
from app.services.profile_service import refresh_profile
from app.utils.response import ok

router = APIRouter(prefix="/scenario", tags=["场景推演"])


@router.post("/infer")
async def infer(
    req: ScenarioInferRequest,
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = await AgentService(db).infer(req.behavior, req.scene_type)

    # 无关输入（未识别到风险）不写入推演记录，避免污染画像与统计
    if result["level"] == "none":
        data = {
            "inference_id": 0,
            "behavior": req.behavior,
            "consequence": result["consequence"],
            "risk_score": result["risk_score"],
            "level": result["level"],
            "correction": result["correction"],
            "ai_checked": result["ai_checked"],
            "critic_summary": result["critic_summary"],
            "engine": result["engine"],
            "source_refs": result["source_refs"],
            "confidence": result["confidence"],
            "evidence": result["evidence"],
            "trust_mode": result["trust_mode"],
            "verified_by": result["verified_by"],
            "critic_divergence": result["critic_divergence"],
            "score_breakdown": result["score_breakdown"],
            "ai_provider": result["ai_provider"],
        }
        if client_type == "mobile":
            data["source_refs"] = result["source_refs"][:3]
        return ok(data)

    # 记录操作记录
    record = OperationRecord(
        user_id=user.id,
        behavior=req.behavior,
        scene_type=req.scene_type,
        scene_code=getattr(req, "scene_code", ""),
        risk_score=result["risk_score"],
        level=result["level"],
        consequence=result["consequence"],
        correction=result["correction"],
        ai_checked=result["ai_checked"],
        critic_divergence=result["critic_divergence"],
        ai_provider=result["ai_provider"],
        source_refs=json.dumps(result["source_refs"], ensure_ascii=False),
        score_breakdown=json.dumps(result["score_breakdown"], ensure_ascii=False),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # 高频错误自动收录到案例库
    if result["level"] in ("high", "medium"):
        existing = (
            db.query(CaseEntry).filter(CaseEntry.behavior == req.behavior[:100]).first()
        )
        if existing:
            existing.frequency += 1
        else:
            db.add(CaseEntry(
                behavior=req.behavior[:100],
                risk_level=result["level"],
                frequency=1,
                status="pending",
                source="user",
                scene_type=req.scene_type,
                analysis=result["consequence"][:200],
            ))
        db.commit()

    # 刷新个人画像
    refresh_profile(db, user.id)

    data = {
        "inference_id": record.id,
        "behavior": req.behavior,
        "consequence": result["consequence"],
        "risk_score": result["risk_score"],
        "level": result["level"],
        "correction": result["correction"],
        "ai_checked": result["ai_checked"],
        "critic_summary": result["critic_summary"],
        "engine": result["engine"],
        "source_refs": result["source_refs"],
        "confidence": result["confidence"],
        "evidence": result["evidence"],
        "trust_mode": result["trust_mode"],
        "verified_by": result["verified_by"],
        "critic_divergence": result["critic_divergence"],
        "score_breakdown": result["score_breakdown"],
        "ai_provider": result["ai_provider"],
    }
    # 移动端字段裁剪：仅保留前 3 条条款，结构保持一致
    if client_type == "mobile":
        data["source_refs"] = result["source_refs"][:3]
    return ok(data)
