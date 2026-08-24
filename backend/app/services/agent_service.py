"""双智能体服务：Actor（执行AI）生成初稿，Critic（校验AI）反向复核。

改进点：
- Actor：Ollama 可用时调用本地 LLM 生成自然语言推演；不可用时降级为规则引擎
- Critic：对 Actor 输出做多维度校验（风险等级一致性、条款溯源准确性、关键词覆盖度），
  而非仅检查"需修正"三个字
- 语义匹配：使用 RAG 服务的 TF-IDF 余弦相似度替代 2-gram 匹配
"""
import re
from typing import List

from app.services.prompt_service import get_template
from app.services.rag_service import RAGService, _tokenize, try_ollama_generate, try_ollama_generate_async
from app.services.scoring_service import compute_risk_score, none_breakdown
from app.config import settings

# 风险关键词分级（用于规则引擎降级路径）
# 关键建模原则：RISK_KEYWORDS 只收录「确实做错了动作」的词，
# 不要把「描述危险物质/环境」的词（腐蚀/高温/易燃/明火…）当作违规动作——
# 否则学生会把"在通风橱处理易燃试剂""确认无明火后离开"这类正确操作误判为高危。
RISK_KEYWORDS = {
    "high": ["不戴", "未佩戴", "未戴", "破皮", "破损", "严禁",
             "不穿", "未穿", "未断", "不关", "未关", "未停", "未断电",
             "无证", "裸手", "徒手", "违规", "未配平",
             "无人值守", "独自", "下水道", "嘴吸", "倒回"],
    "medium": ["省略", "跳过", "未按", "不按", "凭经验", "大意", "随意", "简化", "不看", "不读",
               "不查", "不清", "未清", "不关电源", "忘记", "漏", "少", "临时", "替代", "未检查",
               "未消毒", "未确认", "未配平", "模糊", "缠绕", "打结", "涂改", "伪造"],
    "low": ["快速", "赶时间", "边做边看", "少量", "轻拿", "缓慢", "未盖"],
}

# 仅描述「危险物质/环境」的上下文词：单独出现不构成违规动作，不计入风险分与等级；
# 仅用于领域识别与 RAG 佐证（如"处理易燃试剂"本身无错，错在方式）。
CONTEXT_KEYWORDS = ["腐蚀", "高温", "高压", "易燃", "爆炸", "明火", "危险", "浓硫酸", "试剂", "酒精灯"]

# 高危概念的正向覆盖词：判定 Actor 是否「已就某高危概念给出提醒/整改」时，
# 不仅看字面负向词（未佩戴/直接）是否出现，也看其正向改写或防护用语是否出现。
# 这样当 Actor 用「请佩戴护目镜」「缓慢沿壁加入」等正确整改语言时，不会被误判为遗漏。
# 仅当 Actor 对该危险概念「一个相关词都没提」时才视为真正遗漏。
KEYWORD_POSITIVE = {
    "未佩戴": ["佩戴", "戴好", "护目镜", "防护", "手套", "穿戴", "做好防护", "防护装备", "防护用具"],
    "未戴":   ["佩戴", "戴好", "护目镜", "防护", "手套", "穿戴", "做好防护"],
    "不戴":   ["佩戴", "戴好", "护目镜", "防护", "手套", "穿戴", "做好防护"],
    "未穿":   ["穿好", "穿戴", "防护服", "实验服", "防护", "穿着"],
    "不穿":   ["穿好", "穿戴", "防护服", "实验服", "防护", "穿着"],
    "未断电": ["断电", "切断电源", "关闭电源", "停电", "断开电源"],
    "未关":   ["关闭", "关好", "断开", "切断"],
    "未停":   ["停止", "停机", "关闭", "关停"],
    "未配平": ["配平", "平衡", "校准"],
    "未确认": ["确认", "核实", "核对"],
    "未检查": ["检查", "查验", "核对"],
    "未消毒": ["消毒", "灭菌", "清洁"],
    "未清":   ["清理", "清洁", "清空", "清洗"],
    "直接":   ["缓慢", "沿壁", "沿器壁", "沿杯壁", "不要直接", "避免直接", "间接",
               "分步", "依次", "慢慢", "防止飞溅", "先加", "先放"],
    "倒入":   ["加入", "添加", "注入", "加注", "转移", "倾倒"],
    "裸手":   ["佩戴手套", "戴手套", "手套", "防护", "不直接接触"],
    "徒手":   ["佩戴手套", "戴手套", "手套", "防护", "工具夹持"],
    "嘴吸":   ["移液枪", "洗耳球", "吸耳球", "负压", "移液"],
    "下水道": ["废液桶", "指定容器", "收集", "废液", "回收"],
    "倒回":   ["废液", "回收", "指定容器", "不可倒回"],
    "无人值守": ["值守", "看管", "有人", "监护"],
    "独自":   ["陪同", "他人", "老师", "同伴", "有人"],
    "违规":   ["遵守", "按规范", "合规", "按规定", "依规"],
}

# 「直接」后紧跟这些危险动作动词时才算高危（如「直接倒入」「直接打开」「直接通电」）；
# 仅「直接开始/直接操作」等省略准备步骤的语境不应升级为高危，避免误报。
_DIRECT_DANGER_VERBS = (
    "倒入", "打开", "通电", "启动", "运行", "点火", "加热", "接触",
    "操作", "使用", "连接", "移", "送", "充", "拆", "改", "接", "切", "关",
)


# 安全相关领域词：用于判断输入是否属于"实验操作行为"范畴
DOMAIN_WORDS = [
    # 仅化学实验场景专属词；移除「操作/佩戴/防护/电源/安全/违规/危险/
    # 高温/高压/腐蚀/易燃」等通用安全词，否则非化学输入（安全帽/带电设备）
    # 会被误判为化学领域而越界误报。
    "实验", "试剂", "试管", "烧杯", "酒精灯", "加热", "护目镜",
    "手套", "废液", "浓硫酸", "稀释", "通风橱", "实验服", "冰箱", "气瓶",
]


def _keyword_hits(behavior: str) -> dict:
    """统计各等级关键词命中数。"""
    hits = {"high": [], "medium": [], "low": []}
    for level, kws in RISK_KEYWORDS.items():
        for kw in kws:
            if kw in behavior:
                # 「直接」需后接危险动作动词才算高危，避免「直接开始/直接操作」被过度升级
                if kw == "直接":
                    pos = behavior.find(kw)
                    tail = behavior[pos + len(kw):]
                    if not any(v in tail for v in _DIRECT_DANGER_VERBS):
                        continue
                hits[level].append(kw)
    # 方向性危险：仅「水倒入X / 倒入浓硫酸」属于高危倾倒；
    # 正确的「将浓硫酸缓慢沿杯壁倒入水中」不应被「倒入」误判为高危。
    if "倒入" in behavior:
        pos = behavior.find("倒入")
        tail = behavior[pos + 2:]
        head = behavior[:pos]
        if tail.startswith("浓硫酸") or head.endswith("水") or "水倒入" in behavior:
            hits["high"].append("倒入")
        # 否则（如将浓硫酸…倒入水中）不计入，视为正确操作
    return hits


def _hazard_covered(kw: str, actor_reply: str) -> bool:
    """判断 Actor 是否已在输出中覆盖该高危概念（概念级，而非字面匹配）。

    不仅匹配字面负向词（未佩戴/直接），也匹配其正向改写或防护用语
    （如「请佩戴护目镜」「缓慢沿壁加入」），避免把正确整改语言误判为遗漏。
    仅当 Actor 对该危险概念「一个相关词都没提」时才视为真正遗漏。
    """
    if not actor_reply:
        return False
    if kw in actor_reply:
        return True
    for p in KEYWORD_POSITIVE.get(kw, []):
        if p in actor_reply:
            return True
    return False


def _keyword_level(behavior: str) -> str:
    hits = _keyword_hits(behavior)
    if hits["high"]:
        return "high"
    if hits["medium"]:
        return "medium"
    return "low"


def _semantic_similarity(text_a: str, text_b: str) -> float:
    """基于 token 交集的 Jaccard 相似度（轻量级语义匹配）。"""
    tokens_a = set(_tokenize(text_a))
    tokens_b = set(_tokenize(text_b))
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union) if union else 0.0


def _ref_based_level(behavior: str, refs: List[dict]) -> str | None:
    """若行为与检索到的条款描述语义高度重合，采纳该条款的风险等级。"""
    order = {"low": 1, "medium": 2, "high": 3}
    best = None
    best_sim = 0.0
    for ref in refs:
        desc = ref.get("description", "")
        if not desc:
            continue
        sim = _semantic_similarity(behavior, desc)
        if sim > best_sim:
            best_sim = sim
            if sim >= 0.15:  # 语义相似度阈值
                lvl = ref.get("level", "medium")
                if best is None or order[lvl] > order[best]:
                    best = lvl
    return best if best_sim >= 0.15 else None


def _is_domain_input(behavior: str) -> bool:
    """判断输入是否属于安全操作领域（避免对无关输入硬套风险）。"""
    return any(w in behavior for w in DOMAIN_WORDS)


# 安全语境词：步骤明显在「规避危险 / 正确执行」时，不应判为高危。
# 用「防护动作 / 正确装备」概念而非孤立安全短语，使自然描述的正确操作也能稳定降级。
_SAFE_VERBS = [
    "佩戴", "戴好", "穿戴", "防护", "关闭", "关好", "熄灭", "断开", "切断",
    "通风橱", "移液枪", "沿杯壁", "沿器壁", "缓慢", "确认无", "已确认",
    "清理", "盖好", "按规范", "遵守", "正确", "转移", "撤离",
    "已佩戴", "已关闭", "已断开", "已盖", "已通风", "合格",
]
# 不可被安全语境覆盖的「明确危险动作」短语。
_HARD_DANGER = [
    "倒入浓硫酸", "水倒入", "将水倒入", "未佩戴", "未戴", "未穿", "未断电",
    "带电", "明火加热", "嘴吸", "倒回", "裸手", "徒手", "违规操作", "违规",
    "直接倒入", "直接打开",
]


def _safe_context_override(behavior: str, level: str) -> str:
    """安全语境修正：当步骤明显在规避/正确执行危险动作时，降级为低风险。

    用于消除误报（如「关闭酒精灯并确认无明火」被「明火」关键词、
    「将浓硫酸缓慢沿杯壁倒入水中」被「倒入」误判为高危）。
    仅当步骤不含明确危险动作短语时才降级，避免漏判真实危险。
    """
    if level not in ("high", "medium"):
        return level
    # 含明确危险动作短语 -> 不降级（以硬规则为准）
    if any(d in behavior for d in _HARD_DANGER):
        return level
    # 存在正向防护动作且无硬危险 -> 降级为低风险。
    # 注意：防护词若被否定（未关闭/不佩戴/没断开）则不是安全动作，不能降级，
    # 故检查防护词前一个字符是否是否定词。
    NEG = ("未", "不", "没", "切勿", "禁止", "严禁")
    for v in _SAFE_VERBS:
        idx = behavior.find(v)
        while idx != -1:
            if idx == 0 or behavior[idx - 1] not in NEG:
                return "low"
            idx = behavior.find(v, idx + 1)
    return level


def _consequence_text(behavior: str, level: str, hits: dict, refs: List[dict]) -> str:
    """根据命中的关键词和条款生成针对性后果描述。"""
    if level == "none":
        return (
            f"「{behavior}」未识别到明确的安全违规行为或风险操作。"
            "如确实涉及实验/作业安全，请补充操作细节（如是否佩戴防护、是否断电、涉及何种试剂/设备等），"
            "以便进行精准的风险推演。"
        )

    hit_kws = (hits["high"] + hits["medium"])[:3]
    kw_part = f"（命中风险词：{'、'.join(hit_kws)}）" if hit_kws else ""
    ref_part = ""
    if refs:
        ref_part = f"对应条款：{refs[0]['clause_ref'][:60]}。"

    if level == "high":
        return (
            f"「{behavior}」属于高危违规操作{kw_part}：可能导致人身伤害、设备损坏或安全事故，"
            f"并触犯安全红线条款，造成实验/生产事故和合规处罚风险。{ref_part}"
        )
    if level == "medium":
        return (
            f"「{behavior}」存在一定安全隐患{kw_part}：可能引起轻微事故、设备异常或扣分，"
            f"若不纠正会逐步养成违章习惯。{ref_part}"
        )
    return f"「{behavior}」整体风险较低{kw_part}，但仍需按规程规范执行，防止麻痹大意。{ref_part}"


def _correction_text(behavior: str, level: str, hits: dict, refs: List[dict]) -> str:
    """根据命中的关键词生成针对性纠错步骤。"""
    if level == "none":
        return (
            "1. 当前输入未识别到需纠正的风险操作；\n"
            "2. 如需进行安全推演，请描述具体操作行为（如：加热试管时试管口朝向人）；\n"
            "3. 可参考下方示例或切换场景模式后重试。"
        )

    lines = [
        "1. 立即停止当前操作，回到安全状态；",
        "2. 重新阅读对应安全规程，确认正确步骤；",
        "3. 按规程穿戴/检查必要防护用品后再作业；",
        "4. 完成操作后复查现场，确认无遗留隐患。",
    ]
    if hits["high"]:
        lines.insert(0, f"⚠️ 重点纠正：检测到高危行为特征（{'、'.join(hits['high'][:3])}），必须立即整改。")
    ref_part = "；".join(r["clause_ref"] for r in refs[:2]) if refs else "对照本场景安全规程"
    lines.append(f"5. 依据条款：{ref_part}")
    return "\n".join(lines)


# ============================================================
# Critic 校验引擎
# ============================================================

def _critic_validate(
    behavior: str,
    actor_reply: str,
    refs: List[dict],
    rule_level: str,
    rule_score: float,
) -> tuple[int, str]:
    """Critic 多维度校验 Actor 输出。

    校验维度：
    1. 风险等级一致性：Actor 判定的等级是否与规则引擎一致
    2. 条款溯源准确性：Actor 引用的条款是否来自 RAG 检索结果（防幻觉）
    3. 关键词覆盖度：Actor 是否遗漏了行为中的高危关键词

    返回 (ai_checked, critic_summary)
    - ai_checked=1 表示通过，0 表示需修正
    """
    issues = []

    # 维度1：提取 Actor 输出中的风险等级关键词
    actor_level = None
    level_patterns = {
        "high": [r"高危", r"高风险", r"等级[:：]?\s*高", r"红色"],
        "medium": [r"中危", r"中风险", r"等级[:：]?\s*中", r"黄色"],
        "low": [r"低危", r"低风险", r"等级[:：]?\s*低", r"绿色"],
    }
    for lvl, patterns in level_patterns.items():
        for pat in patterns:
            if re.search(pat, actor_reply):
                actor_level = lvl
                break
        if actor_level:
            break

    if actor_level and rule_level != "none":
        order = {"low": 1, "medium": 2, "high": 3}
        if abs(order.get(actor_level, 0) - order.get(rule_level, 0)) >= 2:
            issues.append(
                f"风险等级判定偏差较大：Actor 判定为「{actor_level}」，"
                f"规则引擎判定为「{rule_level}」（分数 {rule_score}）"
            )

    # 维度2：检查 Actor 引用的条款是否来自 RAG 检索结果
    if refs:
        ref_clauses = [r.get("clause_ref", "") for r in refs]
        # 检查 Actor 输出是否包含虚构的条款引用
        clause_mentions = re.findall(r"《[^》]+》", actor_reply)
        for mention in clause_mentions:
            # 检查是否在真实条款中出现（允许部分匹配）
            found = any(mention in clause or clause in mention for clause in ref_clauses)
            if not found and len(mention) > 4:
                # 检查是否是常见法规名称（允许的合理引用）
                common_refs = ["高校实验室安全", "化学实验室", "消防安全",
                               "实验室危险废物", "化学试剂", "危险化学品"]
                if not any(cr in mention for cr in common_refs):
                    issues.append(f"可能存在虚构条款引用：{mention}（未在检索到的规范中找到对应条款）")

    # 维度3：检查 Actor 是否遗漏高危关键词（概念级覆盖，避免负向词改写误报）
    hits = _keyword_hits(behavior)
    if hits["high"]:
        missed = [kw for kw in hits["high"] if not _hazard_covered(kw, actor_reply)]
        if len(missed) >= 2:
            issues.append(f"Actor 可能遗漏了高危关键词：{'、'.join(missed[:3])}")

    if issues:
        summary = "Critic 校验发现以下问题：\n" + "\n".join(f"  - {iss}" for iss in issues)
        return 0, summary
    else:
        checks = [
            "风险等级与规则引擎一致" if rule_level == "none" or actor_level == rule_level or not actor_level else f"等级存在差异但偏差可控（Actor:{actor_level}/Rule:{rule_level}）",
            "条款引用均在检索结果范围内" if refs else "无条款检索结果，跳过溯源校验",
            "高危关键词覆盖完整" if not hits["high"] else f"已覆盖 {len(hits['high'])} 个高危关键词",
        ]
        return 1, "Critic 校验通过：\n" + "\n".join(f"  ✓ {c}" for c in checks)


def _compute_confidence(level: str, hits: dict, refs: List[dict], ref_level: str | None) -> float:
    """返回 0~1 的判定置信度，用于对外「可解释地说明为什么这么判」。

    信号来源（均为确定性规则产出，不依赖 LLM）：
    - 命中风险关键词的数量与等级
    - RAG 检索到的条款语义匹配强度（match_score）
    - 关键词信号与 RAG 语义信号是否指向同一等级（多信号一致加成）
    """
    if level == "none":
        # 负向判定（领域外输入）：我们相对确信它不在风险范畴，给出中等偏高置信。
        return 0.55
    kw_high_n = len(hits["high"])
    kw_med_n = len(hits["medium"])
    kw_low_n = len(hits["low"])
    top_match = max((r.get("match_score", 0.0) for r in refs), default=0.0)

    c = 0.45  # 规则引擎确定性底线
    c += 0.12 * min(kw_high_n, 3)
    c += 0.07 * min(kw_med_n, 3)
    c += 0.05 * min(kw_low_n, 2)
    c += 0.12 * min(top_match / 0.5, 1.0)  # RAG 语义匹配归一化到 0~0.12
    # 多信号一致加成：关键词等级与 RAG 语义等级都指向当前 level
    if (kw_high_n > 0 and ref_level == "high") or (ref_level == level and top_match >= 0.2):
        c += 0.10
    elif ref_level and ref_level == level:
        c += 0.05
    return max(0.0, min(1.0, c))


def _build_evidence(behavior: str, hits: dict, refs: List[dict], ref_level: str | None,
                    is_domain: bool) -> dict:
    """组装可解释的证据链，前端据此展示「判定依据」。"""
    return {
        "domain_input": is_domain,
        "keyword_hits": {
            "high": hits["high"],
            "medium": hits["medium"],
            "low": hits["low"],
        },
        "matched_clauses": [
            {"clause_ref": r.get("clause_ref", ""), "match_score": r.get("match_score", 0)}
            for r in refs
        ],
        "semantic_level": ref_level,  # RAG 语义推断出的风险等级
        "signal_count": (1 if hits["high"] else 0) + (1 if hits["medium"] else 0)
                        + (1 if refs else 0),
    }


def _ground_actor_reply(raw: str | None, behavior: str, consequence: str) -> str:
    """把本地模型生成的旁白「接地」：只允许重述规则后果，禁止编造。

    返回空串表示弃用 LLM 输出、回退规则文案（无幻觉）。判定条件：
    1) 模型确实只表示无需补充（去掉标记后无任何实质内容）；
    2) 模型输出与行为/规则后果几乎无任何词重叠 -> 视为离题幻觉；
    3) 超过 200 字则截断，避免小模型狂输出。
    注意：verdict（风险等级/分数）始终由规则引擎决定，本函数只影响叙事文本。

    关键修正：千问/qwen 常在有效复述后追加「（无需补充）」标记（把 prompt 里的
    "若没有可补充的，只回复「（无需补充）」"误当作结束语）。此时应**剥离标记、保留
    正文**，而非整段丢弃——否则几乎每次都会误判为"无需补充"而降级成规则引擎。
    """
    if not raw:
        return ""
    r = raw.strip()
    # 剥离「无需补充」类标记（支持全/半角括号），保留其前面的实质复述内容。
    for marker in ("（无需补充）", "(无需补充)", "无需补充", "（无需补充）".replace("（", "(").replace("）", ")")):
        r = r.replace(marker, "")
    r = r.strip()
    if not r:
        return ""
    toks = {t for t in (set(_tokenize(behavior)) | set(_tokenize(consequence))) if len(t) >= 2}
    if toks:
        overlap = toks & set(_tokenize(r))
        if len(overlap) == 0:
            return ""
    if len(r) > 200:
        r = r[:200].rstrip("，。、；;,. ") + "…"
    return r


class AgentService:
    """双智能体：Actor 生成 → Critic 复核 → 输出自检结果。

    可信化模型（关键）：
    - 确定性规则引擎（关键词 + RAG 语义 + 打分）永远是「真相源」，无论是否启用 Ollama。
    - Ollama 本地模型只是「自然语言解释增强」，其 Critic 意见作为次级意见，
      仅在规则引擎置信度低时才可被采纳，避免本地模型幻觉反向污染高置信判定。
    - 每次推演都附 confidence（置信度）与 evidence（证据链），结果可解释、可审计。
    """

    def __init__(self, db):
        self.db = db

    async def infer(self, behavior: str, scene_type: str = "experiment") -> dict:
        rag = RAGService(self.db)
        refs = rag.search(behavior, scene_type, top_k=3)
        template = get_template(self.db, "student")
        ref_text = "\n".join(f"- {r['clause_ref']}" for r in refs)

        actor_prompt = template.format(
            behavior=behavior,
            scene_type=scene_type,
            refs=ref_text or "暂无检索到相关条款，请基于通用安全常识判断。",
        ) + (
            "\n\n【重要约束】你只能用 1-2 句中文，生动重述上面给出的「后果」，"
            "帮助学习者理解。严禁编造任何新风险、新事故、新条款或《书名号》引用；"
            "若没有可补充的，只回复「（无需补充）」。"
        )
        # 非阻塞调用 Ollama（线程池 + 并发信号量 + 超时兜底），失败/超时自动降级规则引擎，
        # 不阻塞事件循环，也不会把 FastAPI 请求线程池打满。
        # ENABLE_LLM_NARRATIVE=False 时完全跳过（纯规则叙事，零幻觉）。
        raw_reply = await try_ollama_generate_async(actor_prompt) if settings.ENABLE_LLM_NARRATIVE else None

        # 关键词命中分析
        hits = _keyword_hits(behavior)
        kw_level = _keyword_level(behavior)
        ref_level = _ref_based_level(behavior, refs)
        is_domain = _is_domain_input(behavior)

        # ===== 1) 判定风险等级与分数（确定性规则引擎，永远是真相源）=====
        # 化学域网关：本沙盘仅面向化学实验。只要输入不属于化学领域，
        # 一律判 NONE（即便是通用风险词或 RAG 误检索到化学条款也不越界误报）。
        # 真正的化学违规几乎都含化学领域词，会被 is_domain 正确识别，不会漏判。
        out_of_domain = (not is_domain)
        none_case = out_of_domain
        if none_case:
            level = "none"
            score = 8.0
            score_breakdown = none_breakdown()
            consequence = _consequence_text(behavior, level, hits, refs)
            correction = _correction_text(behavior, level, hits, refs)
        else:
            # 透明化打分：compute_risk_score 同时返回总分与可解释评分明细（A3）
            sc = compute_risk_score(behavior, hits, refs, ref_level)
            level = sc["level"]
            score = sc["risk_score"]
            score_breakdown = sc["breakdown"]
            consequence = _consequence_text(behavior, level, hits, refs)
            correction = _correction_text(behavior, level, hits, refs)

        # ===== 2) 规则引擎自检（Critic 规则维度，确定性）=====
        ai_checked, critic_summary = _critic_validate(
            behavior, raw_reply or consequence, refs, level, score
        )

        # ===== 3) 置信度 + 证据链（对外可解释）=====
        confidence = _compute_confidence(level, hits, refs, ref_level)
        evidence = _build_evidence(behavior, hits, refs, ref_level, is_domain)

        # ===== 4) LLM 增强：仅润色解释，Critic 作为次级意见 =====
        # 叙事旁白：用规则后果「接地」本地模型输出，幻觉/离题时回退规则文案
        narrative_reply = _ground_actor_reply(raw_reply, behavior, consequence) if raw_reply else ""
        trust_mode = "llm_enhanced" if narrative_reply else "rule_deterministic"
        verified_by = "rule_engine"
        critic_divergence = False
        critic_reply = None
        if raw_reply:
            verified_by = "rule_engine+llm_critic"
            critic_prompt = (
                "你是校验AI（Critic）。请复核以下AI输出，检查是否存在：\n"
                "1) 漏判风险（行为涉及高危操作但AI未识别）\n"
                "2) 错误解读（对行为的分析有误）\n"
                "3) 无依据断言/幻觉（引用了不存在的条款或编造了后果）\n"
                "输出格式：\n"
                "复核结论：通过/需修正\n"
                "具体说明：（如有问题逐一列出）\n\n"
                f"用户行为：{behavior}\n"
                f"检索到的规范条款：\n{ref_text or '无'}\n"
                f"AI输出：\n{raw_reply}"
            )
            critic_reply = await try_ollama_generate_async(critic_prompt, max_tokens=256)
            if critic_reply and "需修正" in critic_reply:
                # 关键可信化改动：规则引擎是唯一真相源，LLM Critic 仅作次级（advisory）意见。
                # 本地小模型（qwen2.5:3b）极易把正确或无风险的判定误判为「需修正」，
                # 若允许它把 ai_checked 翻成 0，会产生大量「AI 自检未通过」误报
                # （如 "我今天有点累" / "实验挺简单的" 等本无风险声明的输入都会被判红）。
                # 因此：无论规则置信度高低，critic 的「需修正」一律只标记为「分歧」，
                # 绝不修改 _critic_validate 的确定性结果——ai_checked 为 0 仅当规则发现硬伤。
                critic_divergence = True
                if ai_checked == 1:
                    # 规则已确定性通过，但模型有保留意见 -> 以规则为准，诚实标注分歧。
                    model_label = "千问模型" if settings.AI_PROVIDER == "cloud" else "本地模型"
                    critic_summary = (
                        f"规则引擎确定性判定（置信度 {confidence*100:.0f}%）与{model_label}复核存在分歧，"
                        f"已以规则引擎为准；{model_label}意见：{critic_reply[:120]}"
                    )
                # 若 ai_checked 已为 0（规则 critic 发现硬伤：等级不一致/虚构条款/遗漏高危关键词），
                # 保留规则自检的详细结论，仅标注分歧，不由模型覆盖。

        payload = {
            "behavior": behavior,
            "scene_type": scene_type,
            "consequence": consequence,
            "risk_score": score,
            "level": level,
            "correction": correction,
            "score_breakdown": score_breakdown,
            "source_refs": refs,
            "ai_checked": ai_checked,
            "critic_summary": critic_summary,
            "actor_reply": narrative_reply,
            "critic_reply": critic_reply or "",
            "engine": "cloud" if settings.AI_PROVIDER == "cloud" and narrative_reply else ("ollama" if narrative_reply else "rule"),
            "ai_provider": settings.AI_PROVIDER,
            # ===== 新增可信化字段 =====
            "confidence": round(confidence, 3),
            "evidence": evidence,
            "trust_mode": trust_mode,
            "verified_by": verified_by,
            "critic_divergence": critic_divergence,
        }
        return payload
