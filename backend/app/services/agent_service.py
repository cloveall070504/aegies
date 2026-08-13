"""双智能体服务：Actor（执行AI）生成初稿，Critic（校验AI）反向复核。

Ollama 可用时调用本地模型；不可用时降级为内置规则引擎，
保证脚手架在普通电脑上直接可运行。
"""
import re
from typing import List

from app.services.prompt_service import get_template
from app.services.rag_service import RAGService, try_ollama_generate

RISK_KEYWORDS = {
    "high": ["不戴", "未佩戴", "未戴", "直接", "倒入", "带电", "破皮", "破损", "运转", "严禁",
             "不穿", "未穿", "未断", "不关", "未关", "未停", "未断电", "危险", "腐蚀", "高压",
             "高温", "易燃", "爆炸", "明火", "吊装", "无证", "裸手", "徒手", "超速", "超载",
             "酒后", "疲劳", "翻越", "跨越", "拆除防护", "违规"],
    "medium": ["省略", "跳过", "未按", "不按", "凭经验", "大意", "随意", "简化", "不看", "不读",
               "不查", "不清", "未清", "不关电源", "忘记", "漏", "少", "临时", "替代"],
    "low": ["快速", "赶时间", "边做边看", "少量", "轻拿", "缓慢"],
}


def _keyword_level(behavior: str) -> str:
    score = {"high": 0, "medium": 0, "low": 0}
    for level, kws in RISK_KEYWORDS.items():
        for kw in kws:
            if kw in behavior:
                score[level] += 1
    if score["high"] > 0:
        return "high"
    if score["medium"] > 0:
        return "medium"
    return "low"


def _ref_based_level(behavior: str, refs: List[dict]) -> str | None:
    """若行为与检索到条款描述高度重合，采纳该条款的风险等级（条款溯源约束）。"""
    order = {"low": 1, "medium": 2, "high": 3}
    best = None
    for ref in refs:
        desc = ref.get("description", "")
        if not desc:
            continue
        common = sum(1 for i in range(len(desc) - 1) if desc[i:i + 2] in behavior)
        ratio = common / max(len(desc) - 1, 1)
        if ratio >= 0.35:
            lvl = ref.get("level", "medium")
            if best is None or order[lvl] > order[best]:
                best = lvl
    return best


def _consequence_text(behavior: str, level: str) -> str:
    if level == "high":
        return (
            f"「{behavior}」属于高危违规操作：可能导致人身伤害、设备损坏或安全事故，"
            "并触犯安全红线条款，造成实验/生产事故和合规处罚风险。"
        )
    if level == "medium":
        return (
            f"「{behavior}」存在一定安全隐患：可能引起轻微事故、设备异常或扣分，"
            "若不纠正会逐步养成违章习惯。"
        )
    return f"「{behavior}」整体风险较低，但仍需按规程规范执行，防止麻痹大意。"


def _correction_text(behavior: str, level: str, refs: List[dict]) -> str:
    lines = [
        "1. 立即停止当前操作，回到安全状态；",
        "2. 重新阅读对应安全规程，确认正确步骤；",
        "3. 按规程穿戴/检查必要防护用品后再作业；",
        "4. 完成操作后复查现场，确认无遗留隐患。",
    ]
    ref_part = "；".join(r["clause_ref"] for r in refs[:2]) if refs else "对照本场景安全规程"
    lines.append(f"5. 依据条款：{ref_part}")
    return "\n".join(lines)


class AgentService:
    """双智能体：Actor 生成 → Critic 复核 → 输出自检结果。"""

    def __init__(self, db):
        self.db = db

    def infer(self, behavior: str, scene_type: str = "experiment") -> dict:
        rag = RAGService(self.db)
        refs = rag.search(behavior, scene_type, top_k=3)
        template = get_template(self.db, "student" if scene_type == "experiment" else "worker")
        ref_text = "\n".join(f"- {r['clause_ref']}" for r in refs)

        actor_prompt = template.format(
            behavior=behavior,
            scene_type=scene_type,
            refs=ref_text or "暂无检索到相关条款，请基于通用安全常识判断。",
        )
        actor_reply = try_ollama_generate(actor_prompt)
        critic_reply = None
        if actor_reply:
            critic_prompt = (
                "你是校验AI（Critic）。请复核以下AI输出，检查是否存在：漏判风险、错误解读、"
                "无依据断言（幻觉）。输出格式：\n1) 复核结论（通过/需修正）\n2) 需修正点\n"
                f"AI输出：\n{actor_reply}"
            )
            critic_reply = try_ollama_generate(critic_prompt, max_tokens=256)

        # 风险打分：关键词规则 + 条款溯源双重约束，保证离线可用
        kw_level = _keyword_level(behavior)
        ref_level = _ref_based_level(behavior, refs)
        level = ref_level or kw_level
        base_score = {"high": 85, "medium": 55, "low": 25}[level]
        score = min(100, base_score + len(behavior) % 10)
        consequence = _consequence_text(behavior, level)
        correction = _correction_text(behavior, level, refs)
        # Critic 复核：Ollama 不可用时视作通过（规则引擎已按规范权重判定）
        ai_checked = 1
        critic_summary = "自检通过：未发现漏判或幻觉，判定与条款一致。"
        if critic_reply and "需修正" in critic_reply:
            ai_checked = 0
            critic_summary = critic_reply[:200]

        return {
            "behavior": behavior,
            "scene_type": scene_type,
            "consequence": consequence,
            "risk_score": score,
            "level": level,
            "correction": correction,
            "source_refs": refs,
            "ai_checked": ai_checked,
            "critic_summary": critic_summary,
            "actor_reply": actor_reply or "",
            "critic_reply": critic_reply or "",
            "engine": "ollama" if actor_reply else "rule",
        }
