"""驾驶舱摘要接口：风险看板、红黄绿状态条、高频错误。按场景过滤。"""
from fastapi import APIRouter, Depends, Query
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


def _scene_match(record_scene: str, filter_scene: str) -> bool:
    """场景匹配：experiment 实验场景过滤。"""
    if not filter_scene or filter_scene == "general":
        return True
    aliases = {
        "experiment": {"experiment", "student"},
        "student": {"experiment", "student"},
    }
    target = aliases.get(filter_scene, {filter_scene})
    return record_scene in target


@router.get("/summary")
def summary(
    scene_type: str = Query(default="", description="场景类型过滤：experiment|空=全部"),
    scene_code: str = Query(default="", description="具体场景代码（chem_lab 等），优先于 scene_type"),
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_mobile = client_type == "mobile"
    risk_count = db.query(func.count(RiskPoint.id)).scalar() or 0

    # 用户推演记录（按场景过滤）
    all_records = (
        db.query(OperationRecord)
        .filter(OperationRecord.user_id == user.id)
        .all()
    )
    # scene_code 精确过滤优先
    if scene_code:
        user_records = [r for r in all_records if r.scene_code == scene_code]
    else:
        user_records = [r for r in all_records if _scene_match(r.scene_type, scene_type)]

    red = sum(1 for r in user_records if r.level == "high")
    yellow = sum(1 for r in user_records if r.level == "medium")
    green = sum(1 for r in user_records if r.level == "low")
    avoided_count = green  # 低风险 = 已规避

    # 平均测验分（按当前场景过滤）
    quiz_query = db.query(QuizRecord).filter(QuizRecord.user_id == user.id)
    if scene_code:
        quiz_query = quiz_query.filter(QuizRecord.scene_code == scene_code)
    else:
        quiz_query = quiz_query.filter(QuizRecord.scene_type == scene_type) if scene_type else quiz_query
    all_quizzes = quiz_query.all()
    avg_quiz_score = (sum(q.score for q in all_quizzes) / len(all_quizzes)) if all_quizzes else 0
    if user_records:
        avoid_rate = avoided_count / len(user_records) * 100
        # 综合：有 quiz 用 quiz，无 quiz 用规避率，两者都有则加权
        if all_quizzes:
            pass_rate = round(avg_quiz_score * 0.6 + avoid_rate * 0.4, 1)
        else:
            pass_rate = round(avoid_rate, 1)
    else:
        pass_rate = round(avg_quiz_score, 1)

    # 高频错误
    behavior_counter = {}
    for r in user_records:
        key = r.behavior[:40]
        behavior_counter[key] = behavior_counter.get(key, 0) + 1
    hot_errors = sorted(
        [{"behavior": b, "count": c} for b, c in behavior_counter.items()],
        key=lambda x: -x["count"],
    )[:5]

    # 最近推演记录
    recent = sorted(user_records, key=lambda x: x.id, reverse=True)[: (3 if is_mobile else 5)]
    recent_records = [
        {
            "id": r.id,
            "behavior": r.behavior,
            "risk_score": r.risk_score,
            "level": r.level,
            "scene_type": r.scene_type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent
    ]

    data = {
        "risk_count": risk_count,
        "avoided_count": avoided_count,
        "pass_rate": pass_rate,
        "hot_errors": hot_errors[:3] if is_mobile else hot_errors,
        "status_bar": {"red": red, "yellow": yellow, "green": green},
        "recent_records": recent_records,
        "scene_type": scene_type or "all",
        "scene_code": scene_code or "",
        "total_records": len(user_records),
    }
    return ok(data)
