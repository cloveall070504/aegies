"""报告生成接口：个人/组织培训记录与风险掌握度报告。"""
import json

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_current_user_optional
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.quiz_record import QuizRecord
from app.models.report import Report
from app.models.training import TrainingRecord
from app.models.user import User
from app.services.report_service import generate_org_report, generate_personal_report
from app.utils.response import fail, ok

router = APIRouter(prefix="/report", tags=["报告"])


class ReportRequest(BaseModel):
    type: str = "personal"  # personal / org
    target_id: str = ""     # org 时传 org_id


@router.post("/generate")
def generate(
    req: ReportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        if req.type == "personal":
            path = generate_personal_report(db, user)
            target_id = ""
            title = f"个人避错成长报告-{user.username}"
        elif req.type == "org":
            if not req.target_id:
                return fail("生成组织报告需传 target_id（org_id）", code=400)
            path = generate_org_report(db, req.target_id)
            target_id = req.target_id
            title = f"组织风险掌握度报告-{req.target_id}"
        else:
            return fail("不支持的报告类型", code=400)
    except Exception as exc:  # noqa: BLE001
        return fail(f"报告生成失败：{exc}", code=500)

    report = Report(
        user_id=user.id,
        org_id=target_id,
        type=req.type,
        title=title,
        file_path=path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ok({
        "report_id": report.id,
        "title": title,
        "download_url": f"/api/v1/report/{report.id}/download",
    }, message="报告已生成")


@router.get("")
def list_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Report).filter(Report.user_id == user.id).order_by(Report.id.desc()).limit(20).all()
    return ok([r.to_dict() for r in items])


@router.get("/{report_id}/download")
def download(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_optional),
):
    report = db.get(Report, report_id)
    if not report:
        return fail("报告不存在", code=404)
    # 权限校验：仅报告所有者或管理员/教师可下载
    if user and report.user_id != user.id and user.role not in ("admin", "teacher"):
        return fail("无权下载此报告", code=403)
    if not user:
        return fail("请先登录", code=401)
    from fastapi.responses import FileResponse
    return FileResponse(
        report.file_path,
        media_type="application/pdf",
        filename=f"{report.title}.pdf",
    )


@router.get("/online/{report_type}")
def online_report(
    report_type: str,
    scene_code: str = Query(default="", description="按场景代码过滤"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """在线可视化报表数据（JSON），前端用图表渲染。"""
    # 推演记录
    op_q = db.query(OperationRecord).filter(OperationRecord.user_id == user.id)
    if scene_code:
        op_q = op_q.filter(OperationRecord.scene_code == scene_code)
    records = op_q.order_by(OperationRecord.id).all()

    # 风险分布
    dist = {"high": 0, "medium": 0, "low": 0}
    for r in records:
        dist[r.level] = dist.get(r.level, 0) + 1

    # 风险趋势
    trend = [
        {"idx": i + 1, "score": r.risk_score, "level": r.level,
         "time": r.created_at.isoformat() if r.created_at else None}
        for i, r in enumerate(records[-15:])
    ]

    # 培训前后对比
    tr_q = db.query(TrainingRecord).filter(TrainingRecord.user_id == user.id)
    if scene_code:
        tr_q = tr_q.filter(TrainingRecord.scene_code == scene_code)
    trainings = tr_q.order_by(TrainingRecord.id.desc()).all()
    training_compare = []
    for tr in trainings:
        if tr.pre_at and tr.post_at:
            training_compare.append({
                "scene_code": tr.scene_code,
                "pre_score": tr.pre_score,
                "post_score": tr.post_score,
                "improvement": round(tr.post_score - tr.pre_score, 1),
            })

    # 考试成绩
    quiz_q = db.query(QuizRecord).filter(QuizRecord.user_id == user.id)
    if scene_code:
        quiz_q = quiz_q.filter(QuizRecord.scene_code == scene_code)
    quizzes = quiz_q.order_by(QuizRecord.id).all()
    quiz_scores = [{"idx": i + 1, "score": q.score, "time": q.created_at.isoformat() if q.created_at else None} for i, q in enumerate(quizzes[-10:])]

    data = {
        "risk_distribution": dist,
        "risk_trend": trend,
        "training_compare": training_compare,
        "quiz_scores": quiz_scores,
        "total_inferences": len(records),
        "total_quizzes": len(quizzes),
        "avg_risk": round(sum(r.risk_score for r in records) / len(records), 1) if records else 0,
        "avg_quiz": round(sum(q.score for q in quizzes) / len(quizzes), 1) if quizzes else 0,
        "scene_code": scene_code,
    }
    return ok(data)
