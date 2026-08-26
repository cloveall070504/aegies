"""融合「风险扫描 + 场景推演」的交互式避错沙盘服务。

设计要点：
- 复用 agent_service.AgentService.infer 的确定性规则引擎与可信化框架
  （置信度 / 证据链 / 双AI复核 / 条款溯源 / 可选 LLM 旁白）。
- 叠加 scan_service 的「关联案例」能力（命中高危/中危关键词时链接已发布案例）。
- 新增「仿真世界反应 + 下一步分支」：把一次性分类器升级为可交互的逐步推演闭环，
  风险评估结果永远以确定性规则引擎为准（LLM 仅作自然语言增强，可离线降级）。
"""
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.case_entry import CaseEntry
from app.services.agent_service import (
    AgentService,
    _keyword_hits,
    _ref_based_level,
    _is_domain_input,
    _consequence_text,
    _correction_text,
    _compute_confidence,
    _build_evidence,
    _safe_context_override,
    _HARD_DANGER,
)


def _related_case_ids(db: Session, behavior: str) -> List[int]:
    """命中高危/中危关键词时，按关键词检索已发布案例（取 scan 的能力）。"""
    hits = _keyword_hits(behavior)
    kw_focus = (hits["high"] + hits["medium"])[:1]
    if not kw_focus:
        return []
    cases = (
        db.query(CaseEntry)
        .filter(CaseEntry.behavior.contains(kw_focus[0]), CaseEntry.status == "approved")
        .limit(3)
        .all()
    )
    return [c.id for c in cases]


def _simulate_world(res: dict, step: str, history: List[str]):
    """根据风险等级生成仿真世界反应与下一步分支选项。

    返回 (world_reaction, next_options, terminated, termination_reason)。
    旁白优先展示 LLM 文本（解决「LLM 未展示」问题），无模型时降级为规则后果文案。
    """
    level = res.get("level", "none")
    consequence = res.get("consequence", "")
    correction = res.get("correction", "")
    actor_reply = (res.get("actor_reply") or "").strip()
    step_no = len(history) + 1

    narrator = actor_reply or consequence.strip()

    if level == "high":
        # 仅当属于明确危险动作（红线）时才中断推演；否则严重但可补救，给出纠偏分支继续循环
        if any(d in step for d in _HARD_DANGER):
            world_reaction = (
                f"【第 {step_no} 步 · 高危红线】{narrator} "
                f"此操作极可能引发事故，推演在此中断以规避真实伤害。"
            )
            return world_reaction, [], True, "触发高危红线，已中断推演"
        world_reaction = (
            f"【第 {step_no} 步 · 高危】{narrator} "
            f"此步骤风险很高，建议立即纠正后再继续。"
        )
        next_options = [
            {"label": "立即按规范补救", "hint": correction, "suggest_next": correction},
            {"label": "继续当前操作（暂不处理）", "hint": "风险未消除，可能升级",
             "suggest_next": f"在风险未消除的情况下继续：{step}"},
            {"label": "暂停并求助指导老师", "hint": "最稳妥的做法", "suggest_next": "暂停操作并呼叫指导老师到场确认安全"},
        ]
        return world_reaction, next_options, False, ""

    if level == "medium":
        world_reaction = (
            f"【第 {step_no} 步 · 中危】{narrator} "
            f"若此时不处理，风险可能在后续步骤中累积放大。"
        )
        next_options = [
            {"label": "立即按规范补救", "hint": correction, "suggest_next": correction},
            {"label": "继续当前操作（暂不处理）", "hint": "风险未消除，可能升级",
             "suggest_next": f"在风险未消除的情况下继续：{step}"},
            {"label": "暂停并求助指导老师", "hint": "最稳妥的做法",
             "suggest_next": "暂停操作并呼叫指导老师到场确认安全"},
        ]
        return world_reaction, next_options, False, ""

    if level == "low":
        world_reaction = (
            f"【第 {step_no} 步 · 低危】{narrator} "
            f"风险较低，仍建议按规范执行以避免意外。"
        )
        next_options = [
            {"label": "规范完成本步并继续", "hint": correction or "保持当前规范操作",
             "suggest_next": correction or "继续下一步规范操作"},
            {"label": "继续当前操作", "hint": "风险较低", "suggest_next": f"继续：{step}"},
        ]
        return world_reaction, next_options, False, ""

    # none：安全
    world_reaction = f"【第 {step_no} 步 · 安全】{narrator} 操作合规，可继续。"
    next_options = [{"label": "继续下一步", "hint": "保持规范即可", "suggest_next": ""}]
    return world_reaction, next_options, False, ""


async def simulate_step(db: Session, step: str, scene_id: str = "", history: Optional[List[str]] = None) -> dict:
    """融合推演：逐步风险分析 + 可信化标签 + 关联案例 + 仿真世界反应 + 下一步分支。"""
    history = history or []
    scene_type = scene_id or "experiment"

    # 1) 复用推演的可信化判定（确定性规则引擎永远是真相源）；AI 增强非阻塞。
    res = await AgentService(db).infer(step, scene_type)

    # 1.5) 安全语境修正：规避/正确执行危险动作的步骤不应判高危，并重算一致性字段
    new_level = _safe_context_override(step, res["level"])
    if new_level != res["level"]:
        hits = _keyword_hits(step)
        refs = res.get("source_refs", [])
        ref_level = _ref_based_level(step, refs)
        # 降级后的分数以目标等级为基线 + 关键词加成 + 长度修正；
        # 避免 RAG 误匹配（如"正确稀释浓硫酸"匹配到"将水倒入浓硫酸"高危条款）
        # 把安全操作重新拉回高分。
        base = {"high": 75.0, "medium": 45.0, "low": 20.0}[new_level]
        bonus = min(len(hits.get("high", [])), 4) * 5 + min(len(hits.get("medium", [])), 4) * 4
        score = max(5, min(100, round(base + bonus + min(len(step), 30) * 0.2, 1)))
        res["level"] = new_level
        res["risk_score"] = score
        res["score_breakdown"] = [
            {"factor": "安全语境修正后基线分", "detail": f"修正为{new_level}风险", "delta": base},
            {"factor": "关键词命中加成", "detail": f"高危{len(hits.get('high', []))} 中危{len(hits.get('medium', []))}", "delta": bonus},
            {"factor": "行为描述长度修正", "detail": f"{min(len(step), 30)} 字", "delta": round(min(len(step), 30) * 0.2, 1)},
        ]
        res["consequence"] = _consequence_text(step, res["level"], hits, refs)
        res["correction"] = _correction_text(step, res["level"], hits, refs)
        res["confidence"] = _compute_confidence(res["level"], hits, refs, ref_level)
        res["evidence"] = _build_evidence(step, hits, refs, ref_level, _is_domain_input(step))

    # 2) 叠加扫描能力：关联案例 + 匹配条款（与 scan 一致）
    res["related_case_ids"] = _related_case_ids(db, step)
    res["matched_clauses"] = [r.get("clause_ref", "") for r in res.get("source_refs", [])][:2]

    # 3) 仿真世界反应 + 分支（把一次性分类器升级为交互闭环）
    world_reaction, next_options, terminated, termination_reason = _simulate_world(res, step, history)
    res["world_reaction"] = world_reaction
    res["next_options"] = next_options
    res["terminated"] = terminated
    res["termination_reason"] = termination_reason
    res["step_no"] = len(history) + 1
    return res
