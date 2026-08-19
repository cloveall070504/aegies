"""避错沙盘接口：融合风险扫描与场景推演的交互式逐步推演。"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.user import User
from app.services.simulation_service import simulate_step
from app.utils.response import fail, ok

router = APIRouter(prefix="/simulate", tags=["避错沙盘"])


class SimulateStepRequest(BaseModel):
    step: str
    scene_id: str = ""
    history: list = []


@router.post("/step")
async def simulate(
    req: SimulateStepRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """逐步推演：分析当前步风险（可信化）+ 仿真世界反应 + 给出下一步分支选项。

    history 为之前已执行的步骤（仅用于步骤编号与叙事连续性，逐条判定仍独立进行）。
    非安全领域（level=none）不落库；否则写入 OperationRecord 并返回 record_id，
    供 A2 学生「误判反馈」闭环使用。
    """
    step = (req.step or "").strip()
    if len(step) < 2:
        return fail("请输入一步操作行为后再推演", code=400)
    result = await simulate_step(db, step, req.scene_id, req.history or [])

    # 落库推演记录（与 /scenario/infer 一致），供学生反馈闭环（A2）使用
    if result.get("level") != "none":
        rec = OperationRecord(
            user_id=user.id,
            behavior=step,
            scene_type=req.scene_id or "experiment",
            scene_code="",
            risk_score=result["risk_score"],
            level=result["level"],
            consequence=result["consequence"],
            correction=result["correction"],
            ai_checked=result["ai_checked"],
            critic_divergence=result["critic_divergence"],
            source_refs=json.dumps(result.get("source_refs", []), ensure_ascii=False),
            score_breakdown=json.dumps(result.get("score_breakdown", []), ensure_ascii=False),
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        result["record_id"] = rec.id

    return ok(result)
