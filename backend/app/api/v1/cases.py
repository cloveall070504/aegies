"""错误案例库接口：检索、详情、人工审核。"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models.case_entry import CaseEntry
from app.models.user import User
from app.services.agent_service import (
    AgentService,
    _consequence_text,
    _keyword_hits,
)
from app.services.rag_service import RAGService, try_ollama_generate
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


class ReviewRequest(BaseModel):
    action: str = "approve"  # approve / reject


@router.post("/{case_id}/review")
def review_case(
    case_id: int,
    req: ReviewRequest,
    user: User = Depends(require_roles("teacher", "safety", "admin")),
    db: Session = Depends(get_db),
):
    case = db.get(CaseEntry, case_id)
    if not case:
        return fail("案例不存在", code=404)
    case.status = "approved" if req.action == "approve" else "rejected"
    db.commit()
    return ok(case.to_dict(), message="审核完成")


# ===== 学员侧：案例可练、可讲（闭环打通）=====
@router.post("/{case_id}/practice")
async def practice_case(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """基于本案例推演：把案例行为灌入推演流程，返回判定与解释。"""
    case = db.get(CaseEntry, case_id)
    if not case:
        return fail("案例不存在", code=404)
    svc = AgentService(db)
    result = await svc.infer(case.behavior, case.scene_type or "experiment")
    return ok({"case_id": case_id, "behavior": case.behavior, "result": result})


@router.post("/{case_id}/explain")
def explain_case(
    case_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI 讲解案例：为什么高危、正确处置、后果链；Ollama 不可用时降级为规则文案。"""
    case = db.get(CaseEntry, case_id)
    if not case:
        return fail("案例不存在", code=404)
    prompt = (
        "你是一名实验室安全教官。请基于以下真实错误案例，用简洁中文为学员讲解：\n"
        "1）为什么这是高风险操作；2）正确的处置步骤；3）出错后的后果链。\n\n"
        f"错误行为：{case.behavior}\n"
        f"风险等级：{case.risk_level}\n"
        f"已有分析：{case.analysis or '无'}\n"
    )
    ai_text = try_ollama_generate(prompt, max_tokens=400)
    if not ai_text:
        hits = _keyword_hits(case.behavior)
        refs = RAGService(db).search(case.behavior, case.scene_type or "experiment", top_k=2)
        lvl = case.risk_level if case.risk_level in ("high", "medium", "low") else "medium"
        ai_text = _consequence_text(case.behavior, lvl, hits, refs)
    return ok({"case_id": case_id, "explanation": ai_text})


# ===== 教师 / 管理员：案例内容生产（闭环"输入端"）=====
class CaseUpsert(BaseModel):
    behavior: str
    risk_level: str = "medium"   # high / medium / low
    frequency: int = 1
    status: str = "approved"     # 教师创建即生效，直接进学生案例库
    source: str = "teacher"
    scene_type: str = "general"
    analysis: str = ""


@router.post("")
def create_case(
    req: CaseUpsert,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师创建教学案例（高危错误素材），创建后直接进入学生案例库。"""
    if not str(req.behavior).strip():
        return fail("行为描述不能为空", code=400)
    if req.risk_level not in ("high", "medium", "low"):
        req.risk_level = "medium"
    c = CaseEntry(
        behavior=req.behavior.strip(),
        risk_level=req.risk_level,
        frequency=req.frequency,
        status=req.status,
        source=req.source,
        scene_type=req.scene_type or "general",
        analysis=req.analysis.strip(),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return ok(c.to_dict(), message="案例已创建并发布到案例库")


@router.put("/{case_id}")
def update_case(
    case_id: int,
    req: CaseUpsert,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师编辑已有案例。"""
    c = db.get(CaseEntry, case_id)
    if not c:
        return fail("案例不存在", code=404)
    if not str(req.behavior).strip():
        return fail("行为描述不能为空", code=400)
    if req.risk_level not in ("high", "medium", "low"):
        req.risk_level = "medium"
    c.behavior = req.behavior.strip()
    c.risk_level = req.risk_level
    c.frequency = req.frequency
    c.status = req.status
    c.source = req.source
    c.scene_type = req.scene_type or "general"
    c.analysis = req.analysis.strip()
    db.commit()
    return ok(c.to_dict(), message="案例已更新")


@router.delete("/{case_id}")
def delete_case(
    case_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """教师删除案例。"""
    c = db.get(CaseEntry, case_id)
    if not c:
        return fail("案例不存在", code=404)
    db.delete(c)
    db.commit()
    return ok({"deleted": case_id}, message="案例已删除")
