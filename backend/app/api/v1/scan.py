"""风险扫描接口：按场景批量获取风险点，分页。"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user
from app.database import get_db
from app.models.risk_point import RiskPoint
from app.models.user import User
from app.services.rag_service import RAGService
from app.services.scan_service import analyze_text
from app.utils.response import fail, ok

router = APIRouter(prefix="/scene", tags=["风险扫描"])

# 场景定义：category 用于主题联动（experiment=化学实验）。系统已精简为仅化学实验。
SCENES = [
    {"scene_id": "chem_lab", "name": "化学实验场景", "category": "experiment", "icon": "🧪"},
]
SCENE_NAMES = {s["scene_id"]: s["name"] for s in SCENES}


@router.get("/list")
def scene_list(
    category: str = Query(default="", description="按主题过滤：experiment=化学实验|空=全部"),
    user: User = Depends(get_current_user),
):
    if category:
        items = [s for s in SCENES if s["category"] == category]
    else:
        items = SCENES
    # 排序：同主题在前
    if category:
        items = sorted(items, key=lambda s: 0 if s["category"] == category else 1)
    return ok(items)


@router.get("/{scene_id}/scan")
def scan(
    scene_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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


class ScanTextRequest(BaseModel):
    text: str
    scene_id: str = ""


@router.post("/scan-text")
def scan_text(
    req: ScanTextRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """真扫描：分析用户粘贴的实验步骤/方案，返回逐行结构化风险发现（含关联案例）。"""
    text = (req.text or "").strip()
    if len(text) < 4:
        return fail("请粘贴至少一步实验操作步骤", code=400)
    result = analyze_text(db, text, req.scene_id)
    # E 方案：采集扫描事件，供数据反哺闭环（采集失败不影响主流程）
    try:
        from app.services.feedback_loop_service import record_scan

        record_scan(db=db, user_id=user.id, text=text, result=result, scene_id=req.scene_id)
    except Exception:
        pass
    return ok(result)
