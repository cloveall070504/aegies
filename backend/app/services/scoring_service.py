"""风险打分服务：结合规范权重、用户错误频次计算 0-100 风险分。

新增 `compute_risk_score`：在给出总分的同时，返回**可解释的评分明细**
（score_breakdown），让学生/教师看到「为什么扣到这个分数、扣在哪些信号上」，
落实评分透明化（A3）。
"""
from typing import List, Optional


def score_risk(refs: List[dict], freq: int = 1, behavior_len: int = 0) -> dict:
    """refs: 检索到的风险点列表（含 weight/level）。"""
    if not refs:
        base = 30.0
    else:
        weights = [r.get("weight", 0.5) for r in refs]
        base = sum(weights) / len(weights) * 100
        # 最高等级提升分数
        levels = [r.get("level", "medium") for r in refs]
        if "high" in levels:
            base = max(base, 75)
        elif "medium" in levels:
            base = max(base, 45)

    score = base + min(freq - 1, 5) * 3 + min(behavior_len, 20) * 0.3
    score = max(0, min(100, round(score, 1)))

    # level 和 priority 由最终分数决定
    if score >= 70:
        level = "high"
        priority = "立即整改"
    elif score >= 40:
        level = "medium"
        priority = "限期整改"
    else:
        level = "low"
        priority = "观察提醒"

    return {"risk_score": score, "level": level, "priority": priority}


def compute_risk_score(
    behavior: str,
    hits: dict,
    refs: List[dict],
    ref_level: Optional[str],
) -> dict:
    """计算风险分并返回可解释的评分明细（A3 透明化）。

    与 agent_service 中「确定性规则引擎」的打分逻辑保持一致：
    - 高危基线 75 + 高危关键词(每项 +5，封顶 4 项) + RAG 高危语义匹配(相似度*8，封顶 3)
    - 中危基线 45 + 中危关键词(每项 +4) + RAG 中危语义匹配(相似度*6)
    - 仅条款命中基线 35 + RAG 匹配(相似度*10)
    - 行为长度修正：min(len,30)*0.2
    最终 clamp 到 [5,100]，并按分数回校准 level。
    """
    kh = hits or {"high": [], "medium": [], "low": []}
    kw_high_n = len(kh.get("high", []))
    kw_med_n = len(kh.get("medium", []))
    kw_low_n = len(kh.get("low", []))
    ref_match = round(sum(r.get("match_score", 0) for r in refs), 3)

    breakdown: List[dict] = []

    if kw_high_n > 0 or ref_level == "high":
        level = "high"
        breakdown.append({"factor": "基础风险分（高危基线）", "detail": "命中高危信号", "delta": 75})
        if kw_high_n > 0:
            d = min(kw_high_n, 4) * 5
            breakdown.append({
                "factor": "高危关键词命中",
                "detail": "、".join(kh["high"][:4]) + (f" 等 {kw_high_n} 项" if kw_high_n > 4 else ""),
                "delta": d,
            })
        if ref_level == "high":
            d = round(min(ref_match, 3) * 8, 1)
            breakdown.append({
                "factor": "RAG 语义匹配（高危条款）",
                "detail": f"最高相似度 {ref_match}",
                "delta": d,
            })
    elif kw_med_n > 0 or ref_level == "medium":
        level = "medium"
        breakdown.append({"factor": "基础风险分（中危基线）", "detail": "命中中危信号", "delta": 45})
        if kw_med_n > 0:
            d = min(kw_med_n, 4) * 4
            breakdown.append({
                "factor": "中危关键词命中",
                "detail": "、".join(kh["medium"][:4]) + (f" 等 {kw_med_n} 项" if kw_med_n > 4 else ""),
                "delta": d,
            })
        if ref_level == "medium":
            d = round(min(ref_match, 3) * 6, 1)
            breakdown.append({
                "factor": "RAG 语义匹配（中危条款）",
                "detail": f"最高相似度 {ref_match}",
                "delta": d,
            })
    elif refs:
        level = "medium" if (35 + min(ref_match, 3) * 10) >= 40 else "low"
        breakdown.append({"factor": "基础风险分（条款命中基线）", "detail": "检索到相关条款", "delta": 35})
        d = round(min(ref_match, 3) * 10, 1)
        breakdown.append({
            "factor": "RAG 语义匹配",
            "detail": f"最高相似度 {ref_match}",
            "delta": d,
        })
    else:
        level = "low"
        breakdown.append({"factor": "基础风险分（低危基线）", "detail": "无明确风险信号", "delta": 20})

    length_bonus = round(min(len(behavior), 30) * 0.2, 1)
    breakdown.append({
        "factor": "行为描述长度修正",
        "detail": f"{min(len(behavior), 30)} 字（≤30 字封顶）",
        "delta": length_bonus,
    })

    raw_total = round(sum(b["delta"] for b in breakdown), 1)
    score = max(5, min(100, raw_total))

    # 分数回校准等级（与 agent_service 历史行为一致）
    if score >= 70:
        level = "high"
    elif score >= 40:
        level = "medium"
    else:
        level = "low"

    return {"risk_score": score, "level": level, "breakdown": breakdown}


def none_breakdown() -> List[dict]:
    """未识别到风险信号时的评分明细（A3 透明化）。"""
    return [{
        "factor": "未识别到明确风险信号",
        "detail": "非安全领域输入 / 无风险关键词 / 无匹配条款",
        "delta": 8.0,
    }]
