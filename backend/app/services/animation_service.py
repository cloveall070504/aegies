"""未来后果动画分镜服务。

将一条危险操作「当前动作」映射为一段可动画演示的「未来后果」分镜脚本。
与 AgentService 保持一致的设计原则：规则引擎是唯一事实源，动画分镜由命中的
风险点（level + consequence）确定性生成，绝不凭空编造事故；LLM 仅可对旁白文案
做自然语言润色，失败/超时自动降级为规则文案（诚实不编造）。

分镜脚本结构（供前端 CSS/SVG 动画播放）：
{
  "title":      分镜标题（如「暴沸喷溅」）
  "risk_level": 风险等级 high/medium/low/none
  "frames": [   按时间顺序的动画帧
    {"step": "当前动作", "desc": "……", "effect": "飞溅/爆燃/炸裂/倒吸/中毒/无", "intensity": 1-3},
    ...
  ],
  "narration":  整段旁白（可朗读）
  "engine":     引擎标识（rule / ollama / cloud）
}
"""

from app.services.risk_outcomes import get_risk_outcome, match_risk_outcome

# 风险等级 → 默认后果「画面效果」关键词（用于前端选择动画类型）
_EFFECT_BY_LEVEL = {
    "high": "爆燃/飞溅/炸裂",
    "medium": "隐患积累",
    "low": "轻微疏忽",
    "none": "无风险",
}

# 常见危险动作 → 具体画面效果（确定性映射，规则引擎唯一事实源）
_EFFECT_MAP = {
    "暴沸": "喷溅", "喷溅": "喷溅", "飞溅": "喷溅", "溅出": "喷溅",
    "炸裂": "炸裂", "炸": "炸裂", "爆燃": "爆燃", "燃烧": "爆燃",
    "着火": "爆燃", "火灾": "爆燃", "爆炸": "爆燃", "明火": "爆燃",
    "倒吸": "倒吸", "触电": "触电", "中毒": "中毒", "有毒": "中毒",
    "灼伤": "灼伤", "烫伤": "灼伤", "腐蚀": "腐蚀", "割伤": "割伤",
    "泄漏": "泄漏", "污染": "污染", "自燃": "爆燃", "燃烧": "爆燃",
}

# 危险动作 → 画面主体（用于前端选择 SVG 图形）
# 注意优先级：先按「后果」判断主体，再按「行为」兜底，避免行为中的防护词（如"护目镜"）被误当主体
_SUBJECT_MAP = {
    "暴沸": "试管", "喷溅": "试管", "飞溅": "试管", "溅出": "试管",
    "炸裂": "烧瓶", "爆炸": "烧瓶", "爆燃": "酒精灯", "着火": "酒精灯", "燃烧": "酒精灯",
    "倒吸": "导管", "触电": "插座", "中毒": "通风橱", "有毒": "通风橱",
    "灼伤": "皮肤", "烫伤": "皮肤", "腐蚀": "试剂瓶", "割伤": "玻璃",
    "泄漏": "试剂瓶", "污染": "废液桶", "自燃": "酒精灯", "视力": "眼睛",
}


def _pick_effect(consequence: str) -> str:
    """从后果文本中确定性提取画面效果关键词。"""
    if not consequence:
        return "无"
    for kw, effect in _EFFECT_MAP.items():
        if kw in consequence:
            return effect
    return "隐患"


def _pick_subject(consequence: str, behavior: str) -> str:
    # 优先用「后果文本」判断主体（后果是规则引擎给出的确定事实）
    for kw, subj in _SUBJECT_MAP.items():
        if kw in (consequence or ""):
            return subj
    # 兜底用「行为文本」，但过滤掉防护类词（护目镜/手套/实验服等是防护用品，不是事故主体）
    _PPE = ("护目镜", "手套", "实验服", "面屏", "面具", "防护")
    text = behavior or ""
    for kw, subj in _SUBJECT_MAP.items():
        if kw in text and kw not in _PPE:
            return subj
    return "烧杯"


def _intensity(level: str) -> int:
    return {"high": 3, "medium": 2, "low": 1, "none": 0}.get(level, 1)


def build_animation(behavior: str, level: str, consequence: str, correction: str) -> dict:
    """根据规则引擎判定结果，构建动画分镜脚本（确定性）。"""
    effect = _pick_effect(consequence)
    subject = _pick_subject(consequence, behavior)
    intensity = _intensity(level)

    if level == "none":
        frames = [
            {"step": "当前动作", "desc": behavior, "effect": "无", "intensity": 0},
            {"step": "未来推演", "desc": "未识别到明确风险，操作可正常进行", "effect": "安全", "intensity": 0},
        ]
        title = "操作安全"
    else:
        frames = [
            {"step": "当前动作", "desc": behavior, "effect": "起始", "intensity": 1},
            {"step": "危险发生", "desc": consequence, "effect": effect, "intensity": intensity},
            {"step": "后果扩散", "desc": "若不立即纠正，后果将持续扩大", "effect": effect, "intensity": intensity},
        ]
        title = f"{subject}{effect}风险演示"

    return {
        "title": title,
        "risk_level": level,
        "subject": subject,
        "effect": effect,
        "intensity": intensity,
        "frames": frames,
        "narration": consequence,
        "correction": correction,
        "engine": "rule",
    }
