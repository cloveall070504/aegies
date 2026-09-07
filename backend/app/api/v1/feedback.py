"""学生错误回流接口（A2）：把"系统推演→学生看→学生质疑→教师审核"闭环打通。

- 学生对某条推演记录（OperationRecord）提交反馈（认为判定有误 / 补充说明）；
- 教师/管理员在审核队列看到待处理反馈，标记 resolved / accepted / rejected；
- 反馈落库在 OperationRecord 上（student_feedback / is_misjudge / feedback_status）。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/feedback", tags=["错误回流"])


class FeedbackSubmit(BaseModel):
    record_id: int
    feedback: str = ""
    is_misjudge: bool = False


@router.post("/submit")
def submit_feedback(
    req: FeedbackSubmit,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """学生对自己的推演记录提交反馈（质疑判定或补充说明）。"""
    rec = db.get(OperationRecord, req.record_id)
    if not rec:
        return fail("推演记录不存在", code=404)
    # 仅本人或教师/管理员可提交反馈
    if rec.user_id != user.id and user.role not in ("teacher", "admin"):
        return fail("无权对该记录提交反馈", code=403)
    rec.student_feedback = (req.feedback or "").strip()
    rec.is_misjudge = 1 if req.is_misjudge else 0
    rec.feedback_status = "pending"
    rec.feedback_at = datetime.now()
    db.commit()
    return ok({"record_id": rec.id, "feedback_status": rec.feedback_status}, message="反馈已提交，等待教师审核")


@router.get("/pending")
def list_pending(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师/管理员：列出待处理的学生反馈。"""
    query = db.query(OperationRecord).filter(OperationRecord.feedback_status == "pending")
    total = query.count()
    recs = query.order_by(OperationRecord.feedback_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for r in recs:
        items.append({
            "record_id": r.id,
            "user_id": r.user_id,
            "behavior": r.behavior,
            "level": r.level,
            "risk_score": r.risk_score,
            "score_breakdown": OperationRecord._parse_json(r.score_breakdown),  # A3：教师审核时可见评分依据
            "student_feedback": r.student_feedback or "",
            "is_misjudge": int(r.is_misjudge or 0),
            "feedback_at": r.feedback_at.isoformat() if r.feedback_at else None,
        })
    return ok({"total": total, "items": items})


class ResolveRequest(BaseModel):
    action: str = "resolved"   # resolved / accepted / rejected


@router.post("/{record_id}/resolve")
def resolve_feedback(
    record_id: int,
    req: ResolveRequest,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师/管理员：处理一条学生反馈。"""
    rec = db.get(OperationRecord, record_id)
    if not rec:
        return fail("推演记录不存在", code=404)
    if req.action not in ("resolved", "accepted", "rejected"):
        return fail("action 仅支持 resolved / accepted / rejected", code=400)
    rec.feedback_status = req.action
    db.commit()
    return ok({"record_id": rec.id, "feedback_status": rec.feedback_status}, message="反馈已处理")


@router.get("/insights")
def feedback_insights(
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师/管理员：数据反哺洞察——扫描采集统计与高频误判模式。"""
    from app.services.feedback_loop_service import get_insights

    return ok(get_insights(db))
