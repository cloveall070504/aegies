"""风险扫描接口：按场景批量获取风险点，分页。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user
from app.database import get_db
from app.models.risk_point import RiskPoint
from app.models.user import User
from app.services.rag_service import RAGService
from app.utils.response import ok

router = APIRouter(prefix="/scene", tags=["风险扫描"])

SCENE_NAMES = {
    "chem_lab": "化学实验场景",
    "elec_lab": "电工电子实验场景",
    "workshop": "车间作业场景",
    "general": "通用作业场景",
}


@router.get("/list")
def scene_list(user: User = Depends(get_current_user)):
    return ok([{"scene_id": k, "name": v} for k, v in SCENE_NAMES.items()])


@router.get("/{scene_id}/scan")
def scan(
    scene_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    RAGService(db).seed_risk_points()
    query = db.query(RiskPoint)
    if scene_id != "all":
        query = query.filter(RiskPoint.scene_id == scene_id)
    total = query.count()
    items = query.order_by(RiskPoint.weight.desc()).offset((page - 1) * page_size).limit(page_size).all()
    brief = client_type == "mobile"
    risks = [it.to_dict(brief=brief) for it in items]
    return ok({
        "scene_id": scene_id,
        "scene_name": SCENE_NAMES.get(scene_id, "全部场景"),
        "total": total,
        "page": page,
        "page_size": page_size,
        "risks": risks,
    })
