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
from app.services.risk_outcomes import get_risk_outcome, match_risk_outcome


def _split_steps(text: str) -> List[str]:
    """把用户输入拆成可分析的步骤。按换行、分号、句号切分，去掉空白。"""
    import re
    raw = re.split(r"[\n;；。\.]+", text)
    steps = [s.strip(" \t　•·-") for s in raw if s and s.strip()]
    return steps


def _risk_block(desc: str, source: str, lvl: str, out: dict) -> dict:
    """把一条命中的风险点整理为统一结构，供多风险并发展示与排序。"""
    steps = list(out.get("correction_steps", []))
    base = {"high": 9, "medium": 6, "low": 3}.get(lvl, 3)
    return {
        "source": source,
        "description": desc,
        "level": lvl,
        "consequence": str(out.get("consequence", "")),
        "correction": "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps)) if steps else "",
        "severity_score": min(base + 1, 10),
    }


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

        # 关联错误案例：命中高危/中危关键词时，按关键词检索已发布案例（最多取前 3 个关键词扩大召回）
        related_case_ids = []
        kw_focus = (hits["high"] + hits["medium"])[:3]
        for kw in kw_focus:
            cases = (
                db.query(CaseEntry)
                .filter(CaseEntry.behavior.contains(kw), CaseEntry.status == "approved")
                .limit(3)
                .all()
            )
            for c in cases:
                if c.id not in related_case_ids:
                    related_case_ids.append(c.id)

        # 多风险并发：收集本步命中的所有风险点（不止第一个），供前端展示与排序
        all_risks = []
        _seen = set()
        for ref in refs:
            out = get_risk_outcome(ref.get("description", ""))
            if out:
                desc = ref.get("description", "")
                if desc not in _seen:
                    _seen.add(desc)
                    all_risks.append(_risk_block(desc, "canonical", ref.get("level", level), out))
        fuzzy = match_risk_outcome(step)
        if fuzzy and fuzzy.get("consequence") not in _seen:
            _seen.add(fuzzy.get("consequence"))
            all_risks.append(_risk_block(step, "fuzzy", level, fuzzy))
        for kw in (hits["high"] + hits["medium"]):
            if kw not in _seen:
                _seen.add(kw)
                all_risks.append({
                    "source": "keyword", "match": kw,
                    "level": "high" if kw in hits["high"] else "medium",
                    "consequence": "", "correction": "",
                    "severity_score": 6 if kw in hits["high"] else 4,
                })
        has_specific = any(r["source"] in ("canonical", "fuzzy") for r in all_risks)
        severity_score = min(({"high": 9, "medium": 6, "low": 3}.get(level, 3)) + (1 if has_specific else 0), 10)

        findings.append({
            "index": i,
            "step": step,
            "level": level,
            "keyword_hits": {"high": hits["high"], "medium": hits["medium"], "low": hits["low"]},
            "matched_clauses": [r.get("clause_ref", "") for r in refs][:2],
            "consequence": consequence,
            "correction": correction,
            "related_case_ids": related_case_ids,
            "all_risks": all_risks,
            "severity_score": severity_score,
        })
        summary[level] += 1

    return {
        "total_steps": len(steps),
        "summary": summary,
        "findings": findings,
    }
