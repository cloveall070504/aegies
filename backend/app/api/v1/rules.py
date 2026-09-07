"""可编辑安全规则接口（反向 RAG 升级 · C 方案：规则外置）。

教师/管理员可经此接口对「危险短语 / 安全动词 / 禁止词 / 活泼金属遇水」四类规则
进行增删与重置。规则经 app.services.rules_store 与内置默认「并集」生效，
引擎判定逻辑不变，不破坏「诚实不变量」。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_roles
from app.models.user import User
from app.services import rules_store

router = APIRouter(prefix="/rules", tags=["rules"])


class TermIn(BaseModel):
    scope: str
    term: str


@router.get("")
def get_rules(user: User = Depends(require_roles("teacher", "admin"))):
    """列出四类规则的内置默认、自定义项与生效并集。"""
    return rules_store.list_rules()


@router.post("")
def add_rule(body: TermIn, user: User = Depends(require_roles("teacher", "admin"))):
    """新增一条自定义规则（与内置默认并集生效）。"""
    try:
        terms = rules_store.add_term(body.scope, body.term)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"scope": body.scope, "terms": terms}


@router.delete("")
def remove_rule(scope: str, term: str, user: User = Depends(require_roles("teacher", "admin"))):
    """删除一条自定义规则（仅影响自定义层，不删内置默认）。

    使用 query 参数（DELETE 带 body 非标准）：?scope=...&term=...
    """
    terms = rules_store.remove_term(scope, term)
    return {"scope": scope, "terms": terms}


@router.post("/reset")
def reset_rules(user: User = Depends(require_roles("teacher", "admin"))):
    """清空自定义层，恢复为仅内置默认。"""
    rules_store.reset_rules()
    return {"ok": True}
