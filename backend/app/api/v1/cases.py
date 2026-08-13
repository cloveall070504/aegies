"""错误案例库接口：检索、详情、人工审核。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models.case_entry import CaseEntry
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/cases", tags=["案例库"])


@router.get("")
def list_cases(
    keyword: str = "",
    status: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CaseEntry)
    if keyword:
        query = query.filter(CaseEntry.behavior.contains(keyword))
    if status:
        query = query.filter(CaseEntry.status == status)
    total = query.count()
    items = query.order_by(CaseEntry.frequency.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ok({"total": total, "items": [c.to_dict() for c in items]})


@router.get("/{case_id}")
def case_detail(case_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    case = db.get(CaseEntry, case_id)
    if not case:
        return fail("案例不存在", code=404)
    return ok(case.to_dict())


@router.post("/{case_id}/review")
def review_case(
    case_id: int,
    approve: bool = True,
    user: User = Depends(require_roles("teacher", "safety", "admin")),
    db: Session = Depends(get_db),
):
    case = db.get(CaseEntry, case_id)
    if not case:
        return fail("案例不存在", code=404)
    case.status = "approved" if approve else "rejected"
    db.commit()
    return ok(case.to_dict(), message="审核完成")
