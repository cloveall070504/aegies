"""时序/因果链识别（反向 RAG 升级 · D 方案）。

对整份实验方案的「步骤顺序」做不变量校验：检测两类时序/因果错误——
  1) precondition_before：后果动作（如点燃）出现前，前置动作（如验纯）必须已出现；
  2) forbidden_before：危险动作（如熄灯）不得出现在锚点动作（如移导管）之前。

结果走「建议」通道（causal_findings），**不并入风险分**，与方案1 缺失步骤、
诚实不变量保持一致——只提示顺序问题、绝不把安全/正确操作升级为危险。
"""
from typing import Any, Dict, List

# 有序不变量规则。
# - mode="precondition_before"：trigger 出现前，步骤序列中必须有 precondition（同句或之前）。
# - mode="forbidden_before"：trigger 不得先于 anchor（正确顺序是 anchor 在前）。
CAUSAL_RULES = [
    {
        "id": "gas_light_purity",
        "name": "可燃性气体点燃前须先验纯",
        "trigger": ["点燃", "点火", "点燃酒精灯"],
        "mode": "precondition_before",
        "precondition": ["验纯", "先验纯", "纯度检验"],
        "severity": "high",
        "message": "点燃可燃性气体（如氢气、一氧化碳）前必须先验纯，否则混合空气遇火可能爆炸。",
        "suggestion": "在点燃步骤前补充「验纯」（用燃着的木条靠近气体出口，听爆鸣声判断纯度）。",
    },
    {
        "id": "boiling_chip_before_heat",
        "name": "加热液体（至沸腾/蒸馏）前须加沸石/碎瓷片",
        "mode": "precondition_before",
        "trigger": ["加热液体", "液体加热", "至沸腾", "煮沸", "沸腾", "蒸馏液体", "水浴加热至沸"],
        "precondition": ["沸石", "碎瓷片", "防暴沸"],
        "severity": "medium",
        "message": "加热液体前未加沸石/碎瓷片，液体易暴沸冲出伤人。",
        "suggestion": "在加热步骤前加入沸石或碎瓷片。",
    },
    {
        "id": "condenser_water_before_heat",
        "name": "蒸馏/冷凝前须先通冷凝水",
        "mode": "precondition_before",
        "trigger": ["加热", "蒸馏", "冷凝"],
        "precondition": ["通冷凝水", "先通水", "冷凝水"],
        "severity": "medium",
        "message": "蒸馏/冷凝前未先通冷凝水，蒸气无法有效冷凝，且可能因局部过热发生事故。",
        "suggestion": "先接通冷凝水（下进上出）再加热。",
    },
    {
        "id": "move_tube_before_extinguish",
        "name": "排水法收集后须先移导管再熄灯",
        "mode": "forbidden_before",
        "trigger": ["熄灭酒精灯", "熄灯", "熄灭灯"],
        "anchor": ["移导管", "导管移出", "将导管移出水面", "移出导管"],
        "severity": "high",
        "message": "排水法收集气体结束后若先熄灭酒精灯，试管内压强降低会导致水倒吸、试管炸裂。",
        "suggestion": "先把导管移出水面（或移出试管），再熄灭酒精灯。",
    },
    {
        "id": "check_airtight_before_load",
        "name": "制取气体前须先验气密性再装药品",
        "mode": "precondition_before",
        "trigger": ["装药品", "装入药品", "加药品", "加入药品", "装固体", "装液"],
        "precondition": ["检查气密", "验气密", "查气密性", "气密性"],
        "severity": "medium",
        "message": "制取气体装置应先检查气密性，确认不漏气后再装药品；否则装好后才发现漏气需重装。",
        "suggestion": "在装药品步骤前增加「检查装置气密性」。",
    },
    {
        "id": "rinse_before_medical",
        "name": "皮肤沾到腐蚀品须先冲洗再处理",
        "mode": "precondition_before",
        "trigger": ["就医", "送医", "涂抹", "上药"],
        "precondition": ["大量水冲", "流动水", "立即冲洗", "用水冲洗"],
        "severity": "medium",
        "message": "皮肤沾到腐蚀性试剂应先立即用大量流动水冲洗，再就医/上药；直接上药会加深灼伤。",
        "suggestion": "先以大量流动水冲洗至少15分钟，再就医。",
    },
    {
        "id": "preheat_before_full_heat",
        "name": "集中加热前宜先预热",
        "mode": "precondition_before",
        "trigger": ["集中加热", "固定加热", "对准药品加热"],
        "precondition": ["预热", "均匀加热", "先预热"],
        "severity": "low",
        "message": "试管/烧杯未预热即集中加热，可能因受热不均炸裂。",
        "suggestion": "先使火焰在容器下方来回移动预热，再集中加热。",
    },
]


def detect_causality(steps: List[str]) -> List[Dict[str, Any]]:
    """检测整份方案步骤序列中的时序/因果违反。

    steps：已切分的有序步骤列表（来自 scan_service._split_steps）。
    返回不变量违反列表；无违反返回空列表。不参与风险评级。
    """
    issues = []
    for rule in CAUSAL_RULES:
        trig_hits = [i for i, s in enumerate(steps) if any(t in s for t in rule["trigger"])]
        if not trig_hits:
            continue
        if rule["mode"] == "precondition_before":
            pre_hits = [i for i, s in enumerate(steps) if any(p in s for p in rule["precondition"])]
            for t in trig_hits:
                if not any(p <= t for p in pre_hits):
                    issues.append(_make(rule, t, steps[t]))
        elif rule["mode"] == "forbidden_before":
            anc_hits = [i for i, s in enumerate(steps) if any(a in s for a in rule["anchor"])]
            for t in trig_hits:
                # 正确顺序要求 anchor 出现在 trigger 之前；若 trigger 前无 anchor，则顺序错误
                if not any(a < t for a in anc_hits):
                    issues.append(_make(rule, t, steps[t]))
    return issues


def _make(rule, idx, step_text):
    return {
        "id": rule["id"],
        "name": rule["name"],
        "severity": rule["severity"],
        "step_index": idx,
        "step_text": step_text,
        "message": rule["message"],
        "suggestion": rule["suggestion"],
    }
