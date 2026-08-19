"""组织管理接口：班级/班组风险分布、高频错误排行、成员统计。"""
import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user, require_roles
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.org_profile import OrgProfile
from app.models.quiz_record import QuizRecord
from app.models.user import User
from app.models.assignment import AssignmentProgress
from app.utils.response import fail, ok

router = APIRouter(prefix="/org", tags=["组织画像"])


def _resolve_members(db: Session, org_id: str) -> list[User]:
    """解析组织成员：精确匹配 department；若匹配到成员中无学员（仅本人/空），回退到全部非管理员用户。"""
    if org_id and org_id != "default_org":
        members = db.query(User).filter(User.department == org_id).all()
        if members and any(m.role == "student" for m in members):
            return members
    # 兜底：所有非管理员用户（便于演示，不空数据）
    return db.query(User).filter(User.role != "admin").all()


def _build_org_profile(db: Session, org_id: str, org_name: str) -> OrgProfile:
    members = _resolve_members(db, org_id)
    member_ids = [m.id for m in members]

    records = (
        db.query(OperationRecord)
        .filter(OperationRecord.user_id.in_(member_ids))
        .order_by(OperationRecord.id)
        .all()
        if member_ids else []
    )
    dist = {"high": 0, "medium": 0, "low": 0}
    for r in records:
        dist[r.level] = dist.get(r.level, 0) + 1

    behavior_counter = {}
    for r in records:
        key = r.behavior[:40]
        behavior_counter[key] = behavior_counter.get(key, 0) + 1
    top_errors = [{"behavior": k, "count": v} for k, v in
                  sorted(behavior_counter.items(), key=lambda x: -x[1])[:10]]

    quizzes = (
        db.query(QuizRecord).filter(QuizRecord.user_id.in_(member_ids)).all()
        if member_ids else []
    )
    avg_quiz = round(sum(q.score for q in quizzes) / len(quizzes), 1) if quizzes else 0
    member_stats = {
        "member_count": len(members),
        "record_count": len(records),
        "quiz_count": len(quizzes),
        "avg_quiz_score": avg_quiz,
        # 培训前后对比：before=最近10条之前的旧记录，after=最近10条
        "before_avg_risk": _avg_risk(records, "before"),
        "after_avg_risk": _avg_risk(records, "after"),
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


def _avg_risk(records: list, mode: str = "all") -> float:
    """计算平均风险分。
    mode='before' 取最近10条之前的旧记录（培训前），
    mode='after' 取最近10条（培训后），
    mode='all' 取全部。
    """
    if not records:
        return 0
    if mode == "after":
        pool = records[-10:]
    elif mode == "before":
        pool = records[:-10] if len(records) > 10 else []
    else:
        pool = records
    if not pool:
        return 0
    return round(sum(r.risk_score for r in pool) / len(pool), 1)


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
    data = org.to_dict(brief=(client_type == "mobile"))
    # 列出可用的组织（部门）供前端切换
    departments = (
        db.query(User.department)
        .filter(User.department != "", User.role != "admin")
        .distinct()
        .all()
    )
    data["available_orgs"] = [d[0] for d in departments]
    return ok(data)


@router.get("/members")
def org_members(
    org_id: str = "",
    user: User = Depends(require_roles("teacher", "safety", "admin")),
    db: Session = Depends(get_db),
):
    if not org_id:
        org_id = user.department or "default_org"
    members = _resolve_members(db, org_id)
    return ok([m.to_dict() for m in members])


@router.get("/students-overview")
def students_overview(
    org_id: str = "",
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """学员风险概览（教师/管理员）：每位学生的推演风险统计 + 待办作业数，按高危降序。"""
    if not org_id:
        org_id = user.department or "default_org"
    members = _resolve_members(db, org_id)
    students = [m for m in members if m.role == "student"]

    rows = []
    for s in students:
        records = (
            db.query(OperationRecord)
            .filter(OperationRecord.user_id == s.id)
            .all()
        )
        high = sum(1 for r in records if r.level == "high")
        med = sum(1 for r in records if r.level == "medium")
        low = sum(1 for r in records if r.level == "low")
        avg = round(sum(r.risk_score for r in records) / len(records), 1) if records else 0
        last = max((r.created_at for r in records), default=None)
        pending = (
            db.query(AssignmentProgress)
            .filter(AssignmentProgress.user_id == s.id, AssignmentProgress.status != "completed")
            .count()
        )
        risk_level = "high" if high >= 3 else ("medium" if (high + med) > 0 else "low")
        rows.append({
            "id": s.id,
            "username": s.username,
            "display_name": s.display_name,
            "department": s.department,
            "record_count": len(records),
            "high_count": high,
            "medium_count": med,
            "low_count": low,
            "avg_risk_score": avg,
            "pending_assignments": pending,
            "last_infer_at": last.isoformat() if last else None,
            "risk_level": risk_level,
        })
    # 按高危数、平均分降序
    rows.sort(key=lambda x: (-x["high_count"], -x["avg_risk_score"]))
    return ok({
        "org_id": org_id,
        "total_students": len(rows),
        "at_risk": sum(1 for r in rows if r["risk_level"] == "high"),
        "students": rows,
    })


@router.get("/operation-records")
def operation_records(
    org_id: str = Query("", description="组织/班级，默认取当前教师部门"),
    user_id: int = Query(0, description="按学员筛选，0 表示全部"),
    level: str = Query("", description="按风险等级过滤：high/medium/low"),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """推演批改（教师/管理员）：列出本组织学员的推演/自查记录，供审阅与反馈。"""
    if not org_id:
        org_id = user.department or "default_org"
    members = _resolve_members(db, org_id)
    student_ids = [m.id for m in members if m.role == "student"]
    user_map = {m.id: m for m in members}

    q = db.query(OperationRecord).filter(OperationRecord.user_id.in_(student_ids))
    if user_id:
        q = q.filter(OperationRecord.user_id == user_id)
    if level:
        q = q.filter(OperationRecord.level == level)
    records = q.order_by(OperationRecord.id.desc()).limit(limit).all()

    items = []
    for r in records:
        u = user_map.get(r.user_id)
        d = r.to_dict()
        d["student_name"] = (u.display_name or u.username) if u else f"用户{r.user_id}"
        d["department"] = u.department if u else ""
        items.append(d)
    return ok({"items": items, "total": len(items)})
