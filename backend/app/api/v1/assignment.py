"""作业/培训任务 API：教师布置 → 学生查看 → 进度追踪。

教师角色（teacher/admin）：创建、关闭作业，查看学生进度
学生角色（student）：查看待完成作业，标记完成
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models.assignment import Assignment, AssignmentProgress
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/assignments", tags=["作业管理"])


class CreateAssignment(BaseModel):
    title: str
    description: str = ""
    scene_code: str = ""
    task_type: str = "sim_train"  # sim_train | quiz | infer
    due_date: str | None = None


class UpdateProgress(BaseModel):
    assignment_id: int
    status: str = "completed"  # pending | in_progress | completed
    score: float = 0


class GradeRequest(BaseModel):
    assignment_id: int
    user_id: int
    score: float = 0
    comment: str = ""


# ===== 教师端 =====

@router.post("")
def create_assignment(
    req: CreateAssignment,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师布置培训作业。"""
    due = None
    if req.due_date:
        try:
            due = datetime.fromisoformat(req.due_date)
        except ValueError:
            return fail("due_date 格式错误，应为 ISO 8601", code=400)

    a = Assignment(
        title=req.title,
        description=req.description,
        scene_code=req.scene_code,
        task_type=req.task_type,
        due_date=due,
        created_by=user.id,
        status="active",
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    # 为所有学生创建进度记录
    students = db.query(User).filter(User.role == "student").all()
    for s in students:
        db.add(AssignmentProgress(assignment_id=a.id, user_id=s.id, status="pending"))
    db.commit()

    return ok(a.to_dict(), message="作业已发布，已通知所有学生")


@router.get("")
def list_assignments(
    status: str = Query(default="active"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出作业：教师/管理员看全部，学生看分配给自己的。"""
    if user.role in ("teacher", "admin"):
        q = db.query(Assignment)
        if status != "all":
            q = q.filter(Assignment.status == status)
        items = q.order_by(Assignment.id.desc()).all()
        result = []
        for a in items:
            d = a.to_dict()
            total = db.query(AssignmentProgress).filter(
                AssignmentProgress.assignment_id == a.id
            ).count()
            completed = db.query(AssignmentProgress).filter(
                AssignmentProgress.assignment_id == a.id,
                AssignmentProgress.status == "completed",
            ).count()
            d["total_students"] = total
            d["completed_count"] = completed
            result.append(d)
        return ok(result)
    else:
        # 学生视角：查看分配给自己的作业 + 自己的进度
        q = (db.query(Assignment, AssignmentProgress)
             .join(AssignmentProgress, AssignmentProgress.assignment_id == Assignment.id)
             .filter(AssignmentProgress.user_id == user.id))
        if status != "all":
            q = q.filter(Assignment.status == status)
        items = q.order_by(Assignment.id.desc()).all()
        result = []
        for a, p in items:
            d = a.to_dict()
            d["my_status"] = p.status
            d["my_score"] = p.score
            d["my_completed_at"] = p.completed_at.isoformat() if p.completed_at else None
            result.append(d)
        return ok(result)


@router.get("/{assignment_id}/progress")
def get_progress(
    assignment_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师查看某作业的学生完成进度。"""
    a = db.get(Assignment, assignment_id)
    if not a:
        return fail("作业不存在", code=404)
    progress = (db.query(AssignmentProgress, User)
                .join(User, User.id == AssignmentProgress.user_id)
                .filter(AssignmentProgress.assignment_id == assignment_id)
                .all())
    students = []
    for p, u in progress:
        students.append({
            "user_id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "department": u.department,
            "status": p.status,
            "score": p.score,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        })
    return ok({
        "assignment": a.to_dict(),
        "students": students,
        "total": len(students),
        "completed": sum(1 for s in students if s["status"] == "completed"),
    })


@router.put("/{assignment_id}/close")
def close_assignment(
    assignment_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """关闭作业（不再接受提交）。"""
    a = db.get(Assignment, assignment_id)
    if not a:
        return fail("作业不存在", code=404)
    if user.role == "teacher" and a.created_by != user.id:
        return fail("无权操作他人作业", code=403)
    a.status = "closed"
    db.commit()
    return ok(a.to_dict(), message="作业已关闭")


@router.put("/{assignment_id}/grade")
def grade_assignment(
    assignment_id: int,
    req: GradeRequest,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师批改学生作业：打分 + 评语。"""
    p = db.query(AssignmentProgress).filter(
        AssignmentProgress.assignment_id == assignment_id,
        AssignmentProgress.user_id == req.user_id,
    ).first()
    if not p:
        return fail("未找到该学生的作业记录", code=404)
    p.score = req.score
    p.comment = req.comment
    p.graded = 1
    # 同时更新作业整体的批改信息
    a = db.get(Assignment, assignment_id)
    if a:
        a.score = req.score
        a.comment = req.comment
        a.graded_by = user.id
        a.graded_at = datetime.now(timezone.utc)
    db.commit()
    return ok(p.to_dict(), message="批改完成")


@router.get("/{assignment_id}/gradebook")
def gradebook(
    assignment_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师成绩册：某作业所有学生的成绩和评语。"""
    a = db.get(Assignment, assignment_id)
    if not a:
        return fail("作业不存在", code=404)
    progress = (db.query(AssignmentProgress, User)
                .join(User, User.id == AssignmentProgress.user_id)
                .filter(AssignmentProgress.assignment_id == assignment_id)
                .all())
    students = []
    for p, u in progress:
        students.append({
            "user_id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "department": u.department,
            "status": p.status,
            "score": p.score,
            "comment": p.comment or "",
            "graded": bool(p.graded),
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        })
    return ok({
        "assignment": a.to_dict(),
        "students": students,
        "total": len(students),
        "graded": sum(1 for s in students if s["graded"]),
        "completed": sum(1 for s in students if s["status"] == "completed"),
    })


# ===== 学生端 =====

@router.put("/progress")
def update_progress(
    req: UpdateProgress,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """学生更新自己的作业进度（完成时自动记录分数和时间）。"""
    p = db.query(AssignmentProgress).filter(
        AssignmentProgress.assignment_id == req.assignment_id,
        AssignmentProgress.user_id == user.id,
    ).first()
    if not p:
        return fail("未找到对应的作业记录", code=404)

    a = db.get(Assignment, req.assignment_id)
    if not a or a.status != "active":
        return fail("作业已关闭或不存在", code=400)

    p.status = req.status
    if req.status == "completed":
        p.score = req.score
        p.completed_at = datetime.now(timezone.utc)
    db.commit()
    return ok(p.to_dict(), message="进度已更新")


@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师删除作业：连同其学生进度记录一并移除。"""
    a = db.get(Assignment, assignment_id)
    if not a:
        return fail("作业不存在", code=404)
    db.query(AssignmentProgress).filter(AssignmentProgress.assignment_id == assignment_id).delete()
    db.delete(a)
    db.commit()
    return ok({"deleted": True}, message="作业已删除")
