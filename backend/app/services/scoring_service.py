"""风险打分服务：结合规范权重、用户错误频次计算 0-100 风险分。"""
from typing import List


def score_risk(refs: List[dict], freq: int = 1, behavior_len: int = 0) -> dict:
    """refs: 检索到的风险点列表（含 weight/level）。"""
    if not refs:
        base = 30.0
        level = "low"
    else:
        weights = [r.get("weight", 0.5) for r in refs]
        base = sum(weights) / len(weights) * 100
        # 最高等级提升分数
        levels = [r.get("level", "medium") for r in refs]
        if "high" in levels:
            base = max(base, 75)
            level = "high"
        elif "medium" in levels:
            base = max(base, 45)
            level = "medium"
        else:
            level = "low"

    score = base + min(freq - 1, 5) * 3 + min(behavior_len, 20) * 0.3
    score = max(0, min(100, round(score, 1)))

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
