"""驾驶舱摘要接口：风险看板、红黄绿状态条、高频错误。"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.quiz_record import QuizRecord
from app.models.risk_point import RiskPoint
from app.models.user import User
from app.utils.response import ok

router = APIRouter(prefix="/dashboard", tags=["驾驶舱"])


@router.get("/summary")
def summary(
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    risk_count = db.query(func.count(RiskPoint.id)).scalar() or 0
    avoided_count = (
        db.query(func.count(OperationRecord.id))
        .filter(OperationRecord.user_id == user.id, OperationRecord.risk_score < 40)
        .scalar() or 0
    )
    quizzes = db.query(QuizRecord).filter(QuizRecord.user_id == user.id).all()
    pass_rate = round(sum(q.score for q in quizzes) / len(quizzes), 1) if quizzes else 0

    hot = (
        db.query(OperationRecord.behavior, func.count(OperationRecord.id).label("cnt"))
        .filter(OperationRecord.user_id == user.id)
        .group_by(OperationRecord.behavior)
        .order_by(func.count(OperationRecord.id).desc())
        .limit(5)
        .all()
    )
    hot_errors = [{"behavior": b[:40], "count": c} for b, c in hot]

    if client_type == "mobile":
        data = {
            "risk_count": risk_count,
            "avoided_count": avoided_count,
            "pass_rate": pass_rate,
        }
    else:
        data = {
            "risk_count": risk_count,
            "avoided_count": avoided_count,
            "pass_rate": pass_rate,
            "hot_errors": hot_errors,
            "status_bar": {
                "red": risk_count,
                "yellow": sum(1 for r in hot_errors),
                "green": avoided_count,
            },
        }
    return ok(data)
