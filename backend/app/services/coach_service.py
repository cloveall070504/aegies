"""数字人教练编排服务（12 项能力后端逻辑）。

设计原则（与 chy07 两条铁律一致）：
- 所有安全结论（哪一步危险、列哪些风险点）都由规则引擎判定后**传入**本服务，
  本服务只做"教练编排"（追问/提示/归因/节奏/情绪/成就），**绝不自己下安全结论**。
- 诚实不变量：high/medium 必须呈现具体风险点（用规则引擎文本）；low/none 绝不列。
- 纯逻辑函数（socratic_next / progressive_hints / attribute_error / assess_state /
  recommend_pace / detect_emotion / speech_rate_for / vision_advice）不依赖 DB，
  规则引擎结果由调用方（路由层）通过 await AgentService(db).infer(...) 算出后传参，
  因此可在测试中直接注入，避免异步与网络依赖。
- DB 相关函数（画像/偏好/成就）接受 db 会话，走既有 ORM。
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.coach import StudentCoachProfile, CoachBadge
from app.services.agent_service import _is_correct_safe_operation
from app.services import rules_store


# ---------------------------------------------------------------------------
# 主题知识库：把"风险主题"映射到苏格拉底问题 / 三级提示 / 错因资源。
# 内容均来自确定性知识（非 LLM 编造），与规则引擎口径一致。
# ---------------------------------------------------------------------------
_TOPIC_BANK = {
    "dilution": {
        "keywords": ["浓硫酸", "稀释", "倒", "酸入水", "烧杯"],
        "socratic_intro": "你觉得稀释浓硫酸时，应该先倒水还是先倒酸？为什么？",
        "deepen": "很好。那如果反过来——把水倒进浓硫酸里，会发生什么？",
        "correct_guide": "你的方向有风险。记住口诀：酸入水，沿杯壁，慢慢倒，不断搅。"
                         "把水倒进浓硫酸会局部暴沸、酸液飞溅，会严重灼伤。",
        "hints": [
            "想一想两种液体的密度，谁更重、会沉在下面？",
            "水和浓硫酸，谁应该被慢慢加入另一种里？",
            "浓硫酸比水重，若先放水再倒酸，酸会沉底剧烈放热——应把酸沿杯壁缓缓加入水中并不断搅拌。",
        ],
        "resource": {"type": "概念讲解", "title": "浓硫酸稀释：酸入水原则"},
    },
    "heating_tube": {
        "keywords": ["加热", "试管", "焰心", "预热"],
        "socratic_intro": "用试管加热液体时，试管口应该对着谁？为什么？",
        "deepen": "不错。那加热前为什么要先预热、再用外焰固定加热？",
        "correct_guide": "试管口不能对着自己或别人——液体暴沸喷出会烫伤。先预热再固定在外焰加热，"
                         "试管夹夹在中上部，液体不超过容积 1/3。",
        "hints": [
            "加热时最怕什么意外？液体突然喷出来会伤到谁？",
            "试管该怎么夹、液体装多少才安全？",
            "试管口略向上倾斜、不对人，夹在中上部，液体不超 1/3，先预热再外焰加热。",
        ],
        "resource": {"type": "概念讲解", "title": "试管加热的安全姿态"},
    },
    "smell_gas": {
        "keywords": ["闻", "气体", "扇闻", "瓶口"],
        "socratic_intro": "要闻一种未知气体的气味，直接凑过去闻可以吗？为什么？",
        "deepen": "对。那正确的闻法具体怎么做？",
        "correct_guide": "绝不能把鼻子凑到瓶口直接闻！用手轻轻扇动瓶口空气、让少量气体飘过来闻（扇闻法），"
                         "有毒气体须在通风橱操作。",
        "hints": [
            "直接深吸一口未知气体可能怎样？",
            "怎样能'闻到'又尽量不吸入？",
            "用手在瓶口轻轻扇风，使极少量气体飘向鼻孔（扇闻法）；有毒气体必须在通风橱内。",
        ],
        "resource": {"type": "概念讲解", "title": "闻气体：扇闻法"},
    },
    "waste": {
        "keywords": ["废液", "下水道", "回收", "排放"],
        "socratic_intro": "实验废液能不能直接倒进下水道？为什么？",
        "deepen": "那不同废液该怎么分类处理？",
        "correct_guide": "不能直接倒下水道！酸碱、重金属、有机溶剂要分别收集到指定废液桶，"
                         "由专人统一处理，防止污染和水体危害。",
        "hints": [
            "下水道连着什么？废液进去会去哪？",
            "不同性质的废液能混在一起吗？",
            "废液分类收集到指定废液桶/回收瓶，严禁倒入水槽、厕所等。",
        ],
        "resource": {"type": "概念讲解", "title": "废液分类与回收"},
    },
    "reactive_metal": {
        "keywords": ["钠", "钾", "白磷", "活泼金属", "遇水"],
        "socratic_intro": "金属钠能不能用手直接拿、能不能沾水？为什么？",
        "deepen": "对。那取用和保存时要注意什么？",
        "correct_guide": "金属钠/钾遇水剧烈反应放氢气并起火，绝不能徒手拿、不能沾水，"
                         "要用镊子取、在煤油中保存，白磷要水封。",
        "hints": [
            "钠遇水会发生什么？徒手拿会怎样？",
            "怎么取、怎么保存才不危险？",
            "用镊子取用、保存在煤油里；白磷水封；绝对避水、避徒手。",
        ],
        "resource": {"type": "概念讲解", "title": "活泼金属与遇水反应"},
    },
    "generic": {
        "keywords": [],
        "socratic_intro": "你刚才做的这步，你觉得哪一步最容易出问题？为什么？",
        "deepen": "理解得不错，那如果条件变了，这个做法还安全吗？",
        "correct_guide": "这一步要按规程来，不确定的地方我们可以放到避错沙盘里推演一遍。",
        "hints": [
            "这一步的目的你清楚吗？",
            "有没有哪一步顺序错了会更危险？",
            "先想清楚顺序和安全要点，再动手；不确定就先在沙盘里推演。",
        ],
        "resource": {"type": "学习中心", "title": "实验操作安全通识"},
    },
}


def detect_topic(text: str) -> str:
    """从文本中识别最匹配的风险主题（用于选题库）。"""
    t = text or ""
    for topic, info in _TOPIC_BANK.items():
        if topic == "generic":
            continue
        if any(k in t for k in info["keywords"]):
            return topic
    return "generic"


# 主题键 → 面向用户的中文标签（避免把内部键 dilution/heating_tube 暴露给学生）
TOPIC_LABELS = {
    "dilution": "浓硫酸稀释",
    "heating_tube": "试管加热",
    "smell_gas": "闻气体",
    "waste": "废液处理",
    "reactive_metal": "活泼金属",
    "generic": "实验操作",
}


def _answer_shows_understanding(topic: str, answer: str) -> bool:
    """判断学生回答是否表现出"理解正确方向"（用于苏格拉底式深化）。

    注意：苏格拉底是两层追问——第一层问"正确做法"，第二层（deepen）问
    "如果反着来会发生什么/为什么要这样做"。所以判读既要认**操作顺序词**
    （酸入水、扇闻、镊子），也要认**后果认知词**（暴沸、飞溅、烫伤），
    否则学生会把"会发生暴沸飞溅"这个正确答案说对却被误判为答错。
    """
    a = answer or ""
    if not a:
        return False
    if topic == "dilution":
        return ("酸入水" in a or "沿杯壁" in a or "慢慢加" in a
                or ("酸" in a and a.find("酸") < a.find("水"))
                or any(w in a for w in ("暴沸", "飞溅", "溅出", "沸腾", "灼伤", "烫伤")))
    if topic == "heating_tube":
        return ("不对人" in a or "不对着自己" in a or "预热" in a or "外焰" in a
                or any(w in a for w in ("受热均匀", "防炸", "防裂", "骤热", "骤冷", "喷出", "烫伤")))
    if topic == "smell_gas":
        return ("扇闻" in a or "扇风" in a or "不直接" in a or "不凑" in a
                or any(w in a for w in ("中毒", "刺激", "伤害")))
    if topic == "waste":
        return ("废液桶" in a or "回收" in a or "指定" in a or "不倒下水道" in a
                or any(w in a for w in ("污染", "不能混", "分类")))
    if topic == "reactive_metal":
        return ("镊子" in a or "煤油" in a or "不沾水" in a or "不徒手" in a
                or any(w in a for w in ("着火", "燃烧", "爆炸", "起火", "遇水")))
    return False


# ---------------------------------------------------------------------------
# 项1：追问引导（苏格拉底式）
# ---------------------------------------------------------------------------
def socratic_next(
    operation_text: str,
    student_answer: str,
    ground_level: str,
    ground_correction: str = "",
) -> Dict[str, Any]:
    """根据规则引擎判定的 ground_level 与学生对上一步操作的回答，决定下一步教练动作。

    返回 mode ∈ {question, deepen, correct, explain}，content 为数字人该说的话。
    安全结论（correct 模式文案）一律来自规则引擎文本或主题知识库，不用 LLM 生成。
    """
    topic = detect_topic(operation_text) or "generic"
    bank = _TOPIC_BANK[topic]

    if not student_answer:
        return {"mode": "question", "topic": topic, "content": bank["socratic_intro"], "guard": "rule_engine"}

    answer_correct = _is_correct_safe_operation(student_answer) or _answer_shows_understanding(topic, student_answer)
    if answer_correct:
        return {"mode": "deepen", "topic": topic, "content": bank["deepen"], "guard": "rule_engine"}

    if ground_level in ("high", "medium"):
        guide = bank.get("correct_guide") or ground_correction or "这个操作有危险，要小心。"
        return {"mode": "correct", "topic": topic, "content": guide, "guard": "rule_engine"}

    return {
        "mode": "explain",
        "topic": topic,
        "content": ground_correction or bank.get("correct_guide", "我们一起理一理正确做法。"),
        "guard": "rule_engine",
    }


# ---------------------------------------------------------------------------
# 项2：渐进式提示（Hint 分层）
# ---------------------------------------------------------------------------
def progressive_hints(text: str, level: int = 0) -> Dict[str, Any]:
    """返回某操作的三级提示。

    level=0 → 返回全部三级；level∈1..3 → 返回对应那一级。
    内容来自主题知识库（确定性），LLM 不编造步骤。
    """
    topic = detect_topic(text) or "generic"
    hints = _TOPIC_BANK[topic]["hints"]
    if level and 1 <= level <= len(hints):
        return {"topic": topic, "level": level, "hint": hints[level - 1], "all_levels": len(hints)}
    return {
        "topic": topic,
        "levels": [{"level": i + 1, "hint": h} for i, h in enumerate(hints)],
    }


# ---------------------------------------------------------------------------
# 项3：错因归因 + 个性化补救
# ---------------------------------------------------------------------------
_ERROR_TYPE_RESOURCE = {
    "概念错误": {"type": "概念讲解", "title": "先理解原理：学习中心对应章节"},
    "操作习惯": {"type": "操作练习", "title": "针对性操作练习"},
    "记忆偏差": {"type": "闪卡强化", "title": "闪卡方式强化记忆"},
    "安全意识薄弱": {"type": "事故案例", "title": "事故案例 + 安全警示"},
}


def _dilution_wrong(operation_text: str, student_answer: str) -> bool:
    txt = (operation_text or "") + " " + (student_answer or "")
    return "水" in txt and any(a in txt for a in ("浓硫酸", "浓酸", "强酸", "盐酸", "硝酸", "硫酸")) \
        and "酸入水" not in txt and "沿杯壁" not in txt


def _missing_ppe(operation_text: str) -> bool:
    return any(p in (operation_text or "") for p in ("护目镜", "手套", "防护服", "口罩"))


def attribute_error(
    operation_text: str,
    student_answer: str,
    ground_level: str,
) -> Dict[str, Any]:
    """把一次误判归类为四种错因之一，并关联补救资源。

    分类基于规则引擎等级与确定性模式匹配（非 LLM 自由发挥）。
    """
    topic = detect_topic(operation_text) or "generic"
    if ground_level in ("high", "medium"):
        if _dilution_wrong(operation_text, student_answer):
            etype = "概念错误"
        elif _missing_ppe(operation_text):
            etype = "安全意识薄弱"
        elif student_answer and not _is_correct_safe_operation(student_answer):
            etype = "操作习惯"
        else:
            etype = "操作习惯"
    else:
        etype = "记忆偏差"
    return {
        "error_type": etype,
        "topic": topic,
        "reason": f"基于规则引擎判定等级（{ground_level}）与操作文本模式归类。",
        "resource": _ERROR_TYPE_RESOURCE[etype],
    }


# ---------------------------------------------------------------------------
# 项4：学习节奏自适应
# ---------------------------------------------------------------------------
def assess_state(speed: float, accuracy: float, confusion_rate: float) -> str:
    """速度(1慢~3快) × 正确率(0~1) × 困惑频率(0~1) → 学习状态。

    纯函数，便于单测。阈值透明可解释。
    """
    if accuracy >= 0.8 and confusion_rate < 0.2:
        return "流畅"
    if accuracy >= 0.5 and confusion_rate < 0.5:
        return "吃力"
    return "卡住"


_PACE_TABLE = {
    "流畅": {"speech_rate": 1.15, "depth": "深入", "vocab": "专业"},
    "吃力": {"speech_rate": 1.0, "depth": "标准", "vocab": "通俗"},
    "卡住": {"speech_rate": 0.85, "depth": "基础", "vocab": "大白话"},
}


def recommend_pace(state: str) -> Dict[str, Any]:
    return _PACE_TABLE.get(state, _PACE_TABLE["吃力"])


# ---------------------------------------------------------------------------
# 项6：多维度情绪识别
# ---------------------------------------------------------------------------
def detect_emotion(text: str, behavior_signals: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """检测厌学/挫败/倦怠，返回安抚/暂停建议（模板化，不涉及安全结论）。"""
    signals = behavior_signals or {}
    t = (text or "").lower()
    burnout_words = ["烦死了", "不想学", "不想做了", "没意思", "好累", "不想干了", "不想练"]
    if any(w in t for w in burnout_words):
        return {"emotion": "厌学", "signal": "语气含放弃/厌倦词",
                "advice": "先共情安抚：'学安全确实挺磨人的，咱们先歇两分钟，挑一个简单的练练手感？'"}
    if signals.get("rapid_repeat_wrong"):
        return {"emotion": "挫败", "signal": "连续快速点错（泄愤式点击）",
                "advice": "暂停一下：'别急，咱们慢慢来，刚才那步我陪你再走一遍。'"}
    if signals.get("session_minutes", 0) >= 40 and signals.get("error_rate", 0) >= 0.5:
        return {"emotion": "倦怠", "signal": "学习超40分钟且错误率上升",
                "advice": "建议休息：'你已经练了挺久啦，先喝口水，10分钟后再来，状态更好。'"}
    return {"emotion": "中性", "signal": "", "advice": ""}


# ---------------------------------------------------------------------------
# 项8：语速自适应（结合项4 状态 + 用户偏好）
# ---------------------------------------------------------------------------
def speech_rate_for(prefs: Optional[Dict[str, Any]], state: str) -> float:
    base = recommend_pace(state)["speech_rate"]
    if prefs and isinstance(prefs.get("speech_rate"), (int, float)):
        # 用户显式偏好优先，但夹在合理区间，避免极端
        return max(0.7, min(1.3, float(prefs["speech_rate"])))
    return base


# ---------------------------------------------------------------------------
# 项12 / 项11：视觉纠错 & 多模态问答（规则引擎校验闭环）
# ---------------------------------------------------------------------------
def vision_advice(
    ground_level: str,
    ground_consequence: str = "",
    ground_correction: str = "",
) -> Dict[str, Any]:
    """把"画面描述文本"经规则引擎判定后的结果，转成数字人该说的话。

    诚实不变量：high/medium 必须呈现具体风险点（用规则引擎文本）；
    low/none 绝不列风险点，只给中性继续提示。
    """
    if ground_level in ("high", "medium"):
        tip = ground_correction or ground_consequence or "这个操作有危险，请先停下。"
        return {"level": ground_level, "must_warn": True, "tip": tip}
    return {"level": ground_level, "must_warn": False, "tip": "目前这步看起来是安全的，继续就好。"}


# ===========================================================================
# 以下为 DB 相关函数（跨场景长期记忆 / 偏好 / 成就）
# ===========================================================================

def get_or_create_profile(db: Session, user_id: int) -> StudentCoachProfile:
    p = db.query(StudentCoachProfile).filter_by(user_id=user_id).first()
    if not p:
        p = StudentCoachProfile(user_id=user_id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


def record_error(
    db: Session,
    user_id: int,
    text: str,
    level: str,
    error_type: Optional[str] = None,
    topic: Optional[str] = None,
) -> StudentCoachProfile:
    """记录一次错误，更新跨场景长期记忆（薄弱主题 + 错因统计）。"""
    p = get_or_create_profile(db, user_id)
    t = topic or detect_topic(text)

    # 注意：SQLAlchemy JSON 列对"原地修改 + 同一引用重新赋值"检测不到变更，
    # 必须构造新的 list/dict 再赋值，ORM 才会重新序列化落库。
    wt = [dict(x) for x in (p.weak_topics or [])]
    found = next((x for x in wt if x.get("topic") == t), None)
    if found:
        found["count"] = found.get("count", 0) + 1
    else:
        wt.append({"topic": t, "count": 1})
    p.weak_topics = wt

    etc = dict(p.error_type_counts or {})
    key = error_type or "操作习惯"
    etc[key] = etc.get(key, 0) + 1
    p.error_type_counts = etc

    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return p


def get_profile(db: Session, user_id: int) -> Dict[str, Any]:
    p = get_or_create_profile(db, user_id)
    return p.to_dict()


def get_weak_reminder(db: Session, user_id: int, new_topic: str) -> str:
    """跨场景提醒：返回学生最常错的、且非当前主题的薄弱点提醒语。"""
    p = get_or_create_profile(db, user_id)
    wt = p.weak_topics or []
    for x in sorted(wt, key=lambda y: -y.get("count", 0)):
        if x.get("topic") != new_topic:
            label = TOPIC_LABELS.get(x["topic"], x["topic"])
            return (f"你之前在「{label}」类操作上错过 {x['count']} 次，"
                    f"这次注意{label}相关的细节。")
    return ""


def set_prefs(db: Session, user_id: int, prefs: Dict[str, Any]) -> Dict[str, Any]:
    p = get_or_create_profile(db, user_id)
    allowed = {"gender", "voice_type", "speech_rate", "avatar"}
    merged = dict(p.prefs or {})
    for k, v in (prefs or {}).items():
        if k in allowed:
            merged[k] = v
    p.prefs = merged
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return p.to_dict()


# ---------------------------------------------------------------------------
# 项10：成就系统（徽章）
# ---------------------------------------------------------------------------
_BADGE_CATALOG = [
    {"code": "first_exp", "name": "初次上手", "desc": "完成第一个实验推演", "icon": "🌱",
     "threshold": {"experiments_done": 1}},
    {"code": "exp_5", "name": "渐入佳境", "desc": "完成 5 个实验推演", "icon": "🌿",
     "threshold": {"experiments_done": 5}},
    {"code": "safe_3", "name": "安全卫士", "desc": "规避 3 次潜在事故", "icon": "🛡️",
     "threshold": {"incidents_avoided": 3}},
    {"code": "safe_10", "name": "避险达人", "desc": "规避 10 次潜在事故", "icon": "⚔️",
     "threshold": {"incidents_avoided": 10}},
]


def _ensure_badges(db: Session) -> None:
    if db.query(CoachBadge).count() == 0:
        for b in _BADGE_CATALOG:
            db.add(CoachBadge(code=b["code"], name=b["name"], desc=b["desc"], icon=b["icon"]))
        db.commit()


def list_badges(db: Session) -> List[Dict[str, Any]]:
    _ensure_badges(db)
    return [b.to_dict() for b in db.query(CoachBadge).all()]


def award_check(db: Session, user_id: int, event: str) -> Dict[str, Any]:
    """根据事件（experiment_done / incident_avoided）更新计数并解锁新徽章。"""
    p = get_or_create_profile(db, user_id)
    if event == "experiment_done":
        p.experiments_done += 1
    elif event == "incident_avoided":
        p.incidents_avoided += 1
    else:
        return {"newly_unlocked": [], "badges": p.badges or []}
    db.commit()

    _ensure_badges(db)
    newly = []
    badges = list(p.badges or [])
    for b in _BADGE_CATALOG:
        th = b["threshold"]
        ok = all(getattr(p, k, 0) >= v for k, v in th.items())
        if ok and b["code"] not in badges:
            badges.append(b["code"])
            newly.append({"code": b["code"], "name": b["name"], "icon": b["icon"]})
    if newly:
        p.badges = badges
        p.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(p)
    return {"newly_unlocked": newly, "badges": p.badges or []}
