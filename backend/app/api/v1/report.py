"""报告生成接口：个人/组织培训记录与风险掌握度报告。"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.report import Report
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
def download(report_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if not report:
        return fail("报告不存在", code=404)
    from fastapi.responses import FileResponse
    return FileResponse(
        report.file_path,
        media_type="application/pdf",
        filename=f"{report.title}.pdf",
    )
