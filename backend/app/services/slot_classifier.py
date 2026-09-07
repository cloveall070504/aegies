"""结构化槽位安全分类器（反向 RAG 方案2：用结构化槽位替补丁式安全动词表）。

背景：原 agent_service 用 _SAFE_VERBS / _is_prohibition_statement / _is_correct_safe_operation
三套「枚举式」启发函数判断「安全/正确操作 / 禁止陈述」，靠人工往表里加词，
易漏判新说法（如「氯气用碱液吸收后排放」正确操作无法被 _SAFE_VERBS 命中），
属于「补丁式」方案，未来会随规则库膨胀持续回退（复盘已指出）。

本模块把一句操作拆成结构化槽位：
  action（倒入/加入/混合/加热/处置/佩戴…）
  substance（酸/碱/水/溶剂/金属/有毒气体…）
  direction（水入酸 vs 酸入水）
  destination（下水道 vs 指定容器 / 吸收装置）
  ppe（护目镜/手套/实验服）
  modality（禁止/否定/正常）
而后据槽位组合推导意图：danger（真实危险） / correct_safe（正确安全操作） /
prohibition（告诫他人，非执行危险） / neutral（无法判定）。

关键契约（防回归）：
- 本分类器是「乐观」的——只在**高置信**时才返回 correct_safe / prohibition；
  其余一律 neutral/unknown，绝不大胆降危。真实危险由调用方的 _HARD_DANGER / 关键词兜底，
  即使槽位分类漏判，危险也不会被放过（见 agent_service._safe_context_override 的接入顺序）。
- 不依赖数据库，纯函数，可被评测套件离线断言。
"""
import re

# 与 agent_service 解耦：这里独立维护一份「禁止/否定」词表，避免循环导入。
_PROHIBIT_WORDS = (
    "禁止", "严禁", "切勿", "绝不可", "绝对不", "千万不能", "不可",
    "不可以", "不能", "别", "勿", "不要", "不许", "不让", "不应", "不得",
)
# 「未/没 + 防护动作」是真实危险（没戴护目镜、未断电…），即便巧合含禁止词也不降级
_OMISSION_RE = re.compile(r"(未|没|没有|无)(戴|穿|佩戴|戴护目镜|穿实验服|断电|关闭|熄灭|验纯|查气密|洗手|盖)")

_ACID = ("浓硫酸", "浓酸", "强酸", "盐酸", "硝酸", "硫酸", "碱", "强碱")
_POUR = ("倒入", "加入", "加进", "注入", "倒进", "注入水中", "加入水中")
_CORRECT_DISPOSE = (
    "指定容器", "指定废液缸", "废液桶", "回收瓶", "回收桶", "专用容器",
    "废液缸", "收集瓶", "废液收集", "吸收液", "碱液吸收", "吸收装置",
    "尾气吸收", "通风橱", "回收",
)
_BAD_DISPOSE = (
    "下水道", "水槽", "厕所", "河流", "地沟", "阴沟", "排水", "洗手池",
    "马桶", "雨水",
)
_PPE_WORDS = ("护目镜", "防护镜", "手套", "实验服", "白大褂", "防护", "面具")
_PPE_VERB = ("佩戴", "戴好", "穿戴", "穿好", "戴")


def _normalize(text: str) -> str:
    return (text or "").replace("倒进", "倒入").replace("灌进", "倒入")


def _has_negation_window(text: str, pos: int, win: int = 12) -> bool:
    """pos 之前 win 字内是否出现否定词（用于判断 PPE/正确动作是否被否定）。"""
    NEG = ("没有", "没", "未", "不", "别", "无", "切勿", "禁止", "严禁", "忘记", "忽略", "省略")
    window = text[max(0, pos - win):pos]
    return any(n in window for n in NEG)


def _dilution_intent(b: str):
    """返回 'wrong'（水入酸，危险）/ 'right'（酸入水，正确）/ None。"""
    # 酸入水（正确）：某酸出现在倒入动词之前，且水在动词之后
    for a in _ACID:
        ai = b.find(a)
        if ai == -1:
            continue
        for pv in _POUR:
            pi = b.find(pv, ai)
            if pi == -1:
                continue
            if "水" in b[pi + len(pv):]:
                return "right"
    # 水入酸（危险）：水出现在倒入动词之前，且酸在动词之后
    water_pos = b.find("水")
    if water_pos != -1:
        for pv in _POUR:
            pi = b.find(pv)
            if pi == -1:
                continue
            # 水在动词之前
            if water_pos < pi:
                tail = b[pi + len(pv):]
                if any(a in tail for a in _ACID):
                    return "wrong"
    return None


def _dispose_intent(b: str) -> str | None:
    """返回 'right' / 'wrong' / None：废液/试剂/尾气 的去向判定。"""
    has_subj = any(k in b for k in ("废液", "液体", "试剂", "残液", "尾气", "有毒气体", "氯气", "硫化氢"))
    if not has_subj:
        return None
    has_move = any(d in b for d in ("倒入", "倒进", "排入", "放入", "收集到", "收集", "排放", "吸收", "处理", "回收", "回收到"))
    if not has_move:
        return None
    if any(x in b for x in _BAD_DISPOSE):
        return "wrong"
    if any(s in b for s in _CORRECT_DISPOSE):
        return "right"
    # 回收到/回收入 指定容器 视同为正确处置
    if "回收" in b and any(s in b for s in ("指定", "专用", "废液桶", "回收")):
        return "right"
    return None


def _ppe_intent(b: str) -> str | None:
    """返回 'worn'（已正确佩戴）/ 'omitted'（明确未戴）/ None。"""
    # 明确未戴：否定 + 防护词
    if _OMISSION_RE.search(b):
        return "omitted"
    for v in _PPE_VERB:
        vi = b.find(v)
        if vi == -1:
            continue
        if _has_negation_window(b, vi):
            continue
        tail = b[vi + len(v): vi + len(v) + 6]
        if any(p in tail for p in _PPE_WORDS):
            return "worn"
    return None


def classify_safety(behavior: str) -> dict:
    """对单句操作做结构化安全分类。

    返回：
    {
      "intent": "danger" | "correct_safe" | "prohibition" | "neutral" | "unknown",
      "reason": str,
      "slots": {"dilution": ..., "dispose": ..., "ppe": ..., "modality": ...}
    }
    intent 为高置信结论才返回 correct_safe / prohibition；其余 neutral，交由调用方兜底。
    """
    b = _normalize(behavior)
    slots = {"dilution": None, "dispose": None, "ppe": None, "modality": None}

    # 1) 禁止/告诫陈述（非执行危险动作）
    is_prohibit = any(p in b for p in _PROHIBIT_WORDS)
    is_domain = any(w in b for w in ("实验", "试剂", "试管", "烧杯", "酒精灯", "加热",
                                     "护目镜", "手套", "废液", "浓硫酸", "稀释",
                                     "通风橱", "实验服", "气瓶", "移液"))
    if is_prohibit and is_domain and not _OMISSION_RE.search(b):
        return {"intent": "prohibition", "reason": "告诫/禁止他人，非正在执行危险动作",
                "slots": {**slots, "modality": "prohibition"}}

    # 2) 稀释方向
    dil = _dilution_intent(b)
    slots["dilution"] = dil
    if dil == "wrong":
        return {"intent": "danger", "reason": "水被倒入酸（浓硫酸等），稀释方向错误",
                "slots": slots}
    if dil == "right":
        return {"intent": "correct_safe", "reason": "酸入水（正确稀释方向）",
                "slots": slots}

    # 3) 废液/尾气 去向
    disp = _dispose_intent(b)
    slots["dispose"] = disp
    if disp == "wrong":
        return {"intent": "danger", "reason": "危险去向（下水道/未吸收直排）",
                "slots": slots}
    if disp == "right":
        return {"intent": "correct_safe", "reason": "正确处置/吸收（指定容器或吸收装置）",
                "slots": slots}

    # 4) 个人防护佩戴（已正确佩戴 → 安全操作）
    ppe = _ppe_intent(b)
    slots["ppe"] = ppe
    if ppe == "worn":
        return {"intent": "correct_safe", "reason": "已正确佩戴防护装备",
                "slots": slots}
    if ppe == "omitted":
        return {"intent": "danger", "reason": "明确未佩戴防护装备",
                "slots": slots}

    return {"intent": "neutral", "reason": "槽位未命中高置信安全/危险结论",
            "slots": slots}
