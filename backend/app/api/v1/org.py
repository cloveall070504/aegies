"""组织管理接口：班级/班组风险分布、高频错误排行、成员统计。"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user, require_roles
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.org_profile import OrgProfile
from app.models.quiz_record import QuizRecord
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/org", tags=["组织画像"])


def _build_org_profile(db: Session, org_id: str, org_name: str) -> OrgProfile:
    members = db.query(User).filter(User.department == org_id).all()
    member_ids = [m.id for m in members]

    records = db.query(OperationRecord).filter(OperationRecord.user_id.in_(member_ids)).all() if member_ids else []
    dist = {"high": 0, "medium": 0, "low": 0}
    for r in records:
        dist[r.level] = dist.get(r.level, 0) + 1

    behavior_counter = {}
    for r in records:
        key = r.behavior[:40]
        behavior_counter[key] = behavior_counter.get(key, 0) + 1
    top_errors = [{"behavior": k, "count": v} for k, v in
                  sorted(behavior_counter.items(), key=lambda x: -x[1])[:10]]

    quizzes = db.query(QuizRecord).filter(QuizRecord.user_id.in_(member_ids)).all() if member_ids else []
    member_stats = {
        "member_count": len(members),
        "record_count": len(records),
        "quiz_count": len(quizzes),
        "avg_quiz_score": round(sum(q.score for q in quizzes) / len(quizzes), 1) if quizzes else 0,
    }

    profile = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    if profile is None:
        profile = OrgProfile(org_id=org_id, org_name=org_name)
        db.add(profile)
    profile.risk_distribution = json.dumps(dist, ensure_ascii=False)
    profile.top_errors = json.dumps(top_errors, ensure_ascii=False)
    profile.member_stats = json.dumps(member_stats, ensure_ascii=False)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/dashboard")
def org_dashboard(
    org_id: str = "",
    client_type: str = Depends(get_client_type),
    user: User = Depends(require_roles("teacher", "safety", "admin")),
    db: Session = Depends(get_db),
):
    if not org_id:
        org_id = user.department or "default_org"
    org = _build_org_profile(db, org_id, org_id)
    return ok(org.to_dict(brief=(client_type == "mobile")))


@router.get("/members")
def org_members(
    org_id: str = "",
    user: User = Depends(require_roles("teacher", "safety", "admin")),
    db: Session = Depends(get_db),
):
    if not org_id:
        org_id = user.department or "default_org"
    members = db.query(User).filter(User.department == org_id).all()
    return ok([m.to_dict() for m in members])
