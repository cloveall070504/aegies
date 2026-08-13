"""文档上传与知识库构建接口：上传 → 解析 → 风险抽取 → 审核入库。"""
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.document import Document
from app.models.risk_point import RiskPoint
from app.models.user import User
from app.services.doc_parser_service import extract_risk_points, extract_text, save_risk_points
from app.utils.response import fail, ok

router = APIRouter(prefix="/docs", tags=["文档管理"])

ALLOWED_EXT = {".pdf", ".doc", ".docx", ".txt", ".md"}


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    scene_type: str = Form("general"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXT:
        return fail(f"不支持的文件类型 {suffix}，仅支持 PDF/Word/TXT", code=400)

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    target = upload_dir / f"{user.id}_{int(__import__('time').time())}_{file.filename}"

    with open(target, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = Document(
        title=file.filename or "未命名文档",
        file_path=str(target),
        scene_type=scene_type,
        uploaded_by=user.id,
        status="processing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        text = extract_text(str(target))
        risks = extract_risk_points(text, scene_type)
        count = save_risk_points(db, doc.id, risks)
        doc.status = "done"
        db.commit()
        return ok({"doc_id": doc.id, "title": doc.title, "status": "done", "risk_count": count})
    except Exception as exc:  # noqa: BLE001
        doc.status = "failed"
        db.commit()
        return fail(f"文档解析失败：{exc}", code=500)


@router.get("")
def list_docs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Document).order_by(Document.id.desc()).limit(100).all()
    return ok([d.to_dict() for d in items])


@router.get("/{doc_id}/risks")
def doc_risks(doc_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        return fail("文档不存在", code=404)
    risks = db.query(RiskPoint).filter(RiskPoint.doc_id == doc_id).all()
    return ok({"doc_id": doc_id, "risks": [r.to_dict() for r in risks]})
