"""风险扫描服务：把用户粘贴的实验步骤/方案逐行分析，输出结构化风险发现。

复用 agent_service 的确定性规则引擎（关键词/条款语义匹配）与 rag_service 的条款检索，
规则引擎永远作为安全判定的真相源；同时为每个风险点链接相关错误案例，形成「扫描→案例→推演」闭环入口。
"""
from typing import List

from sqlalchemy.orm import Session

from app.models.case_entry import CaseEntry
from app.services.agent_service import (
    _consequence_text,
    _correction_text,
    _is_domain_input,
    _keyword_hits,
    _ref_based_level,
    _safe_context_override,
)
from app.services.rag_service import RAGService


def _split_steps(text: str) -> List[str]:
    """把用户输入拆成可分析的步骤。按换行、分号、句号切分，去掉空白。"""
    import re
    raw = re.split(r"[\n;；。\.]+", text)
    steps = [s.strip(" \t　•·-") for s in raw if s and s.strip()]
    return steps


def analyze_text(db: Session, text: str, scene_id: str = "") -> dict:
    """逐行分析文本，返回结构化风险发现。

    返回：
    {
      "total_steps": int,
      "summary": {"high": n, "medium": n, "low": n, "none": n},
      "findings": [
        {
          "index": int, "step": str, "level": str,
          "keyword_hits": {"high": [...], "medium": [...], "low": [...]},
          "matched_clauses": [str], "consequence": str, "correction": str,
          "related_case_ids": [int]
        }, ...
      ]
    }
    """
    steps = _split_steps(text)
    rag = RAGService(db)
    scene_type = scene_id or "experiment"

    findings = []
    summary = {"high": 0, "medium": 0, "low": 0, "none": 0}

    for i, step in enumerate(steps, start=1):
        hits = _keyword_hits(step)
        refs = rag.search(step, scene_type, top_k=3)
        ref_level = _ref_based_level(step, refs)
        is_domain = _is_domain_input(step)

        # 与 /infer 保持一致的确定性分级逻辑
        if not is_domain and not hits["high"] and not hits["medium"] and not refs:
            level = "none"
        elif hits["high"] or ref_level == "high":
            level = "high"
        elif hits["medium"] or ref_level == "medium" or refs:
            level = "medium" if (hits["medium"] or ref_level == "medium") else "low"
        else:
            level = "low"

        # 安全语境修正：规避/正确执行危险动作的步骤不应判高危
        level = _safe_context_override(step, level)

        consequence = _consequence_text(step, level, hits, refs)
        correction = _correction_text(step, level, hits, refs)

        # 关联错误案例：命中高危/中危关键词时，按关键词检索已发布案例
        related_case_ids = []
        kw_focus = (hits["high"] + hits["medium"])[:1]
        if kw_focus:
            kw = kw_focus[0]
            cases = (
                db.query(CaseEntry)
                .filter(CaseEntry.behavior.contains(kw), CaseEntry.status == "approved")
                .limit(3)
                .all()
            )
            related_case_ids = [c.id for c in cases]

        findings.append({
            "index": i,
            "step": step,
            "level": level,
            "keyword_hits": {"high": hits["high"], "medium": hits["medium"], "low": hits["low"]},
            "matched_clauses": [r.get("clause_ref", "") for r in refs][:2],
            "consequence": consequence,
            "correction": correction,
            "related_case_ids": related_case_ids,
        })
        summary[level] += 1

    return {
        "total_steps": len(steps),
        "summary": summary,
        "findings": findings,
    }
