"""风险点管理接口（A1）：教师/管理员可编辑、审核内置风险知识库。

设计要点：
- 内置种子风险点 source='seed'、reviewed=1（已通过），教师只能编辑/新增/审核，不删除种子本体；
- 教师自建风险点 source='custom'、reviewed=0（待审核），经审核后 reviewed=1 进入检索库；
- 任意修改后调用 _reset_index() 重建 TF-IDF 索引，保证 RAG 检索立即生效。
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models.risk_point import RiskPoint
from app.models.user import User
from app.services.rag_service import _reset_index
from app.utils.response import fail, ok

router = APIRouter(prefix="/risk-points", tags=["风险点管理"])


class RiskPointUpsert(BaseModel):
    scene_id: str = "chem_lab"
    description: str
    level: str = "medium"            # high / medium / low
    weight: float = 0.5             # 0~1 规范权重
    clause_ref: str = ""            # 条款溯源


@router.get("")
def list_risk_points(
    keyword: str = "",
    source: str = "",
    reviewed: int = -1,             # -1=全部 0=待审核 1=已通过 2=已驳回
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出风险点（教师/管理员看全量；学生仅看已通过）。"""
    query = db.query(RiskPoint)
    if keyword:
        query = query.filter(RiskPoint.description.contains(keyword))
    if source:
        query = query.filter(RiskPoint.source == source)
    if reviewed >= 0:
        query = query.filter(RiskPoint.reviewed == reviewed)

    # 学生仅可见已通过（reviewed=1）的风险点；教师/管理员可见全部
    if user.role not in ("teacher", "admin"):
        query = query.filter(RiskPoint.reviewed == 1)

    total = query.count()
    items = query.order_by(RiskPoint.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ok({"total": total, "items": [r.to_dict() for r in items]})


@router.post("")
def create_risk_point(
    req: RiskPointUpsert,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师新增风险点（进入待审核队列）。"""
    if not str(req.description).strip():
        return fail("风险点描述不能为空", code=400)
    if req.level not in ("high", "medium", "low"):
        req.level = "medium"
    rp = RiskPoint(
        scene_id=req.scene_id or "chem_lab",
        description=req.description.strip(),
        level=req.level,
        weight=max(0.0, min(1.0, float(req.weight))),
        clause_ref=req.clause_ref.strip(),
        owner_id=user.id,
        source="custom",
        reviewed=0,
    )
    db.add(rp)
    db.commit()
    db.refresh(rp)
    _reset_index()
    return ok(rp.to_dict(), message="风险点已创建，等待审核后生效")


@router.put("/{rp_id}")
def update_risk_point(
    rp_id: int,
    req: RiskPointUpsert,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师编辑风险点。"""
    rp = db.get(RiskPoint, rp_id)
    if not rp:
        return fail("风险点不存在", code=404)
    if not str(req.description).strip():
        return fail("风险点描述不能为空", code=400)
    if req.level not in ("high", "medium", "low"):
        req.level = "medium"
    rp.scene_id = req.scene_id or rp.scene_id
    rp.description = req.description.strip()
    rp.level = req.level
    rp.weight = max(0.0, min(1.0, float(req.weight)))
    rp.clause_ref = req.clause_ref.strip()
    # 教师修改后回到待审核（除非是种子且本次仅微调，统一走审核更稳妥）
    rp.reviewed = 0
    db.commit()
    _reset_index()
    return ok(rp.to_dict(), message="风险点已更新，等待审核")


@router.delete("/{rp_id}")
def delete_risk_point(
    rp_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师删除自建风险点（种子风险点不可删）。"""
    rp = db.get(RiskPoint, rp_id)
    if not rp:
        return fail("风险点不存在", code=404)
    if rp.source == "seed":
        return fail("内置种子风险点不可删除", code=400)
    db.delete(rp)
    db.commit()
    _reset_index()
    return ok({"deleted": rp_id}, message="风险点已删除")


class ReviewRequest(BaseModel):
    action: str = "approve"   # approve / reject


@router.post("/{rp_id}/review")
def review_risk_point(
    rp_id: int,
    req: ReviewRequest,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """审核教师提交的风险点：通过则进入检索库，驳回则标记。"""
    rp = db.get(RiskPoint, rp_id)
    if not rp:
        return fail("风险点不存在", code=404)
    if req.action == "approve":
        rp.reviewed = 1
    elif req.action == "reject":
        rp.reviewed = 2
    else:
        return fail("action 仅支持 approve / reject", code=400)
    db.commit()
    _reset_index()
    return ok(rp.to_dict(), message="审核完成")
