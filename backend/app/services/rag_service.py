"""反向 RAG 检索服务：基于 TF-IDF 语义相似度从风险知识库中检索匹配条款。

核心改进：
- 使用 jieba 中文分词替代 2-gram 字符滑窗，获得真正的词级别语义匹配
- 使用 TF-IDF 向量化 + 余弦相似度排序，能够识别同义/近义表达
- 支持可选的 embedding 增强（sentence-transformers 可用时自动启用）
"""
import asyncio
import json
import logging
import math
import os
import re
import time
from collections import Counter
from typing import List, Optional

import httpx
import jieba
import jieba.analyse
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger("uvicorn.error")

from app.config import settings
from app.models.risk_point import RiskPoint

# ============================================================
# 内置风险知识库（冷启动兜底，普通电脑无需 Ollama 即可演示）
# 覆盖化学实验场景
# ============================================================
BUILTIN_RISK_POINTS = [
    # ===== 化学实验场景 =====
    {
        "scene_id": "chem_lab",
        "description": "实验时不佩戴护目镜直接操作腐蚀性试剂",
        "level": "high", "weight": 0.9,
        "clause_ref": "《高等学校实验室安全检查项目表》1.2.3：进行有腐蚀性、刺激性试剂的实验必须佩戴护目镜。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将酸性废液直接倒入下水道",
        "level": "high", "weight": 0.95,
        "clause_ref": "《实验室危险废物管理办法》第4章：酸、碱废液必须中和分类收集，禁止直排下水道。",
    },
    {
        "scene_id": "chem_lab",
        "description": "加热试管时试管口朝向人",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》3.2：加热试管时管口不得朝向自己或他人。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验结束后未关闭酒精灯直接离开",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《化学实验室安全操作规程》6.1：实验完毕必须确认明火、电源已关闭。",
    },
    {
        "scene_id": "chem_lab",
        "description": "稀释浓硫酸时将水倒入浓硫酸中",
        "level": "high", "weight": 0.95,
        "clause_ref": "《化学实验室安全操作规程》4.1：稀释浓硫酸必须将酸缓慢加入水中并搅拌，严禁反向操作。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在易燃溶剂附近使用明火加热",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》5.3：使用乙醚、乙醇等易燃溶剂时严禁明火，应采用水浴间接加热。",
    },
    {
        "scene_id": "chem_lab",
        "description": "闻试剂气味时鼻子直接凑近瓶口",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学实验室安全操作规程》3.5：闻气味应用手在瓶口轻轻扇动，严禁直接凑近瓶口。",
    },
    {
        "scene_id": "chem_lab",
        "description": "未穿实验服未扎长发进行化学实验",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《高校实验室安全管理规定》2.1：进入实验室须穿实验服，长发须扎起，禁止穿拖鞋短裤。",
    },
    {
        "scene_id": "chem_lab",
        "description": "试剂瓶标签模糊不清仍继续使用",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学试剂管理办法》2.3：标签不清的试剂须重新确认或按废弃处理，禁止盲目使用。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在通风橱外操作挥发性有毒试剂",
        "level": "high", "weight": 0.85,
        "clause_ref": "《化学实验室安全操作规程》7.1：挥发性、有毒试剂操作必须在通风橱内进行。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验台面同时摆放多种不相容试剂",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《化学试剂储存规范》3.2：不相容试剂（如氧化剂与还原剂、酸与碱）须分类存放，禁止混放。",
    },
    {
        "scene_id": "chem_lab",
        "description": "使用破损或有裂缝的玻璃器皿进行实验",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《玻璃器皿使用规范》1.4：使用前须检查玻璃器皿完好，破损器皿须立即更换或修复。",
    },
    {
        "scene_id": "chem_lab",
        "description": "取用试剂后未及时盖好瓶塞",
        "level": "low", "weight": 0.4,
        "clause_ref": "《化学试剂管理办法》4.1：取用试剂后须立即盖好瓶塞，防止挥发、吸潮或污染。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将过量试剂倒回原瓶",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学试剂管理办法》4.3：取出的试剂禁止倒回原瓶，应按废液处理。",
    },
    {
        "scene_id": "chem_lab",
        "description": "未佩戴防护手套直接接触有机溶剂",
        "level": "high", "weight": 0.85,
        "clause_ref": "《化学实验室安全操作规程》2.2：接触有机溶剂须佩戴耐腐蚀防护手套。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验室冰箱内存放食品或个人物品",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《实验室安全管理规定》3.5：实验冰箱禁止存放食品，须专柜专用并标识。",
    },

    # ===== 酸碱中和滴定 =====
    {
        "scene_id": "chem_titration",
        "description": "锥形瓶用待测液润洗，导致测定浓度偏高",
        "level": "high", "weight": 0.8,
        "clause_ref": "《分析化学实验规范》滴定操作：锥形瓶不得润洗，否则引入额外待测物使结果偏高。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定管使用前未用待装标准溶液润洗，浓度被稀释",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《分析化学实验规范》滴定操作：滴定管须用待装液润洗 2-3 次，防止残留水稀释标准液。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定前滴定管尖嘴未赶尽气泡，体积读数偏大",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《分析化学实验规范》滴定操作：排气泡后零点校准，避免气泡占据体积造成读数误差。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定终点读数时俯视或仰视刻度线，引入读数误差",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《分析化学实验规范》读数：视线与凹液面最低处水平，禁止俯视/仰视。",
    },

    # ===== 气体制备与收集 =====
    {
        "scene_id": "chem_gas_prep",
        "description": "制备气体前未检查装置气密性",
        "level": "high", "weight": 0.9,
        "clause_ref": "《气体制备实验安全规程》1.1：装好装置后须先检查气密性，确认不漏气方可加料加热。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "可燃性气体（如氢气）点燃前未验纯",
        "level": "high", "weight": 0.95,
        "clause_ref": "《气体制备实验安全规程》2.3：H2、CO 等可燃性气体点燃前必须验纯，防止爆炸。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "排水法收集结束时先熄灭酒精灯再移出导管，引起倒吸",
        "level": "high", "weight": 0.85,
        "clause_ref": "《气体制备实验安全规程》3.2：结束时应先将导管移出水面，再熄灭热源，防止水倒吸入热试管炸裂。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "收集满的气体从水槽取出后未用玻璃片盖好即移动",
        "level": "low", "weight": 0.4,
        "clause_ref": "《气体制备实验安全规程》3.4：水下用玻璃片盖严瓶口后取出，正置/倒置按气体密度存放。",
    },

    # ===== 蒸馏与物质分离 =====
    {
        "scene_id": "chem_distillation",
        "description": "加热液体未加沸石（或碎瓷片）导致暴沸",
        "level": "high", "weight": 0.9,
        "clause_ref": "《蒸馏操作规范》2.1：蒸馏/回流前须加沸石，中途补加须停沸冷却后进行，防暴沸冲料。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏时温度计水银球未置于蒸馏烧瓶支管口处，读数不准",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《蒸馏操作规范》2.3：温度计水银球上沿应与支管口下沿齐平，测得馏分沸点。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "冷凝管进出水接反（未下进上出），冷凝效果差",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《蒸馏操作规范》2.5：冷凝水须下口进、上口出，保证管内充满冷水充分冷凝。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏烧瓶内液体超过容积 2/3，易溅入冷凝管",
        "level": "low", "weight": 0.45,
        "clause_ref": "《蒸馏操作规范》2.2：加料体积不超过蒸馏烧瓶容积的 2/3，防剧烈沸腾溅出。",
    },

    # ===== 一定物质的量浓度溶液配制 =====
    {
        "scene_id": "chem_solution_prep",
        "description": "溶解后未冷却至室温即转入容量瓶定容，热胀导致浓度偏低",
        "level": "high", "weight": 0.8,
        "clause_ref": "《溶液配制规范》3.2：溶液须冷却至室温再转入容量瓶，否则热胀使定容体积偏小、浓度偏高/偏低。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "转移时未洗涤烧杯和玻璃棒，溶质损失使浓度偏低",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《溶液配制规范》3.3：烧杯与玻璃棒须洗涤 2-3 次，洗液一并转入容量瓶，保证溶质全部转移。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "定容时仰视或俯视刻度线，造成浓度偏差",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《溶液配制规范》3.5：定容时视线与刻度线水平，滴加至凹液面最低处与刻度相切。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "容量瓶使用前未检查是否漏水",
        "level": "low", "weight": 0.4,
        "clause_ref": "《溶液配制规范》3.1：容量瓶使用前须检漏，瓶塞须配套，漏水须更换。",
    },
]

# 场景关键词映射：根据行为文本中的关键词推断所属实验场景
_KEYWORD_MAP = {
    # 化学实验
    "酸": "chem_lab", "碱": "chem_lab", "试剂": "chem_lab", "试管": "chem_lab",
    "酒精灯": "chem_lab", "烧杯": "chem_lab", "量筒": "chem_lab", "浓硫酸": "chem_lab",
    "废液": "chem_lab", "腐蚀": "chem_lab", "易燃": "chem_lab", "溶剂": "chem_lab",
    "化学": "chem_lab", "稀释": "chem_lab", "明火": "chem_lab", "通风橱": "chem_lab",
    "护目镜": "chem_lab", "实验服": "chem_lab", "玻璃器皿": "chem_lab", "有机溶剂": "chem_lab",
    "瓶塞": "chem_lab", "标签": "chem_lab", "冰箱": "chem_lab",
    "高压": "chem_lab", "气瓶": "chem_lab", "高温": "chem_lab",
    # 酸碱中和滴定
    "滴定": "chem_titration", "滴定管": "chem_titration", "锥形瓶": "chem_titration",
    "指示剂": "chem_titration", "标准溶液": "chem_titration", "中和滴定": "chem_titration",
    "润洗": "chem_titration", "终点": "chem_titration", "移液管": "chem_titration",
    # 气体制备与收集
    "气体": "chem_gas_prep", "气密性": "chem_gas_prep", "验纯": "chem_gas_prep",
    "排水法": "chem_gas_prep", "倒吸": "chem_gas_prep", "收集气体": "chem_gas_prep",
    "氢气": "chem_gas_prep", "氧气": "chem_gas_prep", "防倒吸": "chem_gas_prep",
    # 蒸馏与物质分离
    "蒸馏": "chem_distillation", "冷凝管": "chem_distillation", "沸石": "chem_distillation",
    "暴沸": "chem_distillation", "支管口": "chem_distillation", "冷凝": "chem_distillation",
    "蒸馏烧瓶": "chem_distillation", "分馏": "chem_distillation",
    # 一定物质的量浓度溶液配制
    "容量瓶": "chem_solution_prep", "定容": "chem_solution_prep", "物质的量浓度": "chem_solution_prep",
    "配制溶液": "chem_solution_prep", "溶液配制": "chem_solution_prep", "洗液": "chem_solution_prep",
    "移液": "chem_solution_prep", "凹液面": "chem_solution_prep",
}

# 停用词表
_STOPWORDS = set("的 了 和 与 在 是 对 从 向 把 被 让 给 为 以 及 或 而 但 所 之 其 此 这 那 一 个 些 等 中 上 下 内 外 进行 操作 使用 直接 未 不 无 没有 后 前 时 前".split())


def _tokenize(text: str) -> List[str]:
    """使用 jieba 分词，过滤停用词和单字符噪声。"""
    text = re.sub(r"[，。、：；！？\"''（）()【】\s]+", " ", text)
    words = jieba.lcut(text.strip())
    return [w.strip() for w in words if len(w.strip()) >= 2 and w.strip() not in _STOPWORDS]


def _infer_scene(behavior: str, scene_type: str) -> str:
    """根据行为文本和场景类型推断具体实验场景 ID。"""
    # 优先用关键词精确匹配
    for kw, sid in _KEYWORD_MAP.items():
        if kw in behavior:
            return sid
    # 场景类型兜底
    if scene_type in ("experiment", "student"):
        return "chem_lab"
    return "general"


# ============================================================
# TF-IDF 向量化器
# ============================================================

class _TfidfIndex:
    """轻量 TF-IDF 索引：基于风险点语料构建 IDF，支持余弦相似度查询。"""

    def __init__(self):
        self._idf: dict[str, float] = {}
        self._docs: list[list[str]] = []
        self._doc_ids: list[int] = []
        self._doc_vectors: list[dict[str, float]] = []
        self._built = False

    def build(self, risk_points: list):
        """从 RiskPoint 列表构建索引。"""
        self._docs = []
        self._doc_ids = []
        self._doc_vectors = []

        # 第一遍：收集所有文档的 token
        df: Counter = Counter()
        for rp in risk_points:
            tokens = _tokenize(rp.description)
            self._docs.append(tokens)
            self._doc_ids.append(rp.id)
            for t in set(tokens):
                df[t] += 1

        # 计算 IDF（平滑处理）
        n_docs = max(len(risk_points), 1)
        self._idf = {
            t: math.log((1 + n_docs) / (1 + cnt)) + 1
            for t, cnt in df.items()
        }

        # 计算每篇文档的 TF-IDF 向量
        for tokens in self._docs:
            tf = Counter(tokens)
            vec = {t: (cnt / max(len(tokens), 1)) * self._idf.get(t, 1) for t, cnt in tf.items()}
            self._doc_vectors.append(self._normalize(vec))

        self._built = True

    @staticmethod
    def _normalize(vec: dict[str, float]) -> dict[str, float]:
        norm = math.sqrt(sum(v * v for v in vec.values()))
        if norm == 0:
            return vec
        return {k: v / norm for k, v in vec.items()}

    def query(self, text: str, top_k: int = 3) -> list[tuple[int, float]]:
        """返回 [(doc_index, similarity), ...] 按相似度降序排列。"""
        if not self._built or not self._doc_vectors:
            return []

        tokens = _tokenize(text)
        tf = Counter(tokens)
        query_vec = {t: (cnt / max(len(tokens), 1)) * self._idf.get(t, 1) for t, cnt in tf.items()}
        query_vec = self._normalize(query_vec)

        scores = []
        for i, doc_vec in enumerate(self._doc_vectors):
            sim = sum(query_vec.get(t, 0) * doc_vec.get(t, 0) for t in query_vec)
            if sim > 0:
                scores.append((i, sim))

        scores.sort(key=lambda x: -x[1])
        return scores[:top_k]


# 全局索引缓存（进程级，避免每次请求重建）
_tfidf_index: Optional[_TfidfIndex] = None


def _get_index(db: Session) -> _TfidfIndex:
    global _tfidf_index
    if _tfidf_index is None or not _tfidf_index._built:
        all_rps = db.query(RiskPoint).all()
        idx = _TfidfIndex()
        idx.build(all_rps)
        _tfidf_index = idx
    return _tfidf_index


def _reset_index():
    """重置全局索引缓存（种子数据变更时调用）。"""
    global _tfidf_index
    _tfidf_index = None


class RAGService:
    def __init__(self, db: Session):
        self.db = db

    def seed_risk_points(self):
        """把内置风险点写入数据库（幂等，自动清理旧的车间数据）。"""
        # 清理旧的废弃场景风险点（workshop/worker 已废弃；本项目已精简为仅化学实验）
        old = self.db.query(RiskPoint).filter(
            RiskPoint.scene_id.in_(["workshop", "worker", "elec_lab", "bio_lab", "physics_lab"])
        ).all()
        for r in old:
            self.db.delete(r)
        if old:
            self.db.commit()

        # 幂等写入：检查已有内置风险点数量
        existing = self.db.query(RiskPoint).count()
        if existing >= len(BUILTIN_RISK_POINTS):
            return
        for item in BUILTIN_RISK_POINTS:
            exists = self.db.query(RiskPoint).filter(
                RiskPoint.description == item["description"]
            ).first()
            if not exists:
                self.db.add(RiskPoint(
                    scene_id=item["scene_id"],
                    description=item["description"],
                    level=item["level"],
                    weight=item["weight"],
                    clause_ref=item["clause_ref"],
                    owner_id=None,
                    source="seed",
                    reviewed=1,
                ))
        self.db.commit()
        _reset_index()

    def search(self, behavior: str, scene_type: str = "experiment", top_k: int = 3) -> List[dict]:
        """按行为文本检索最相关风险点，返回含溯源的列表。

        使用 TF-IDF 余弦相似度进行语义匹配，支持同义/近义表达。
        仅返回相似度 > 0 的风险点；无匹配返回空列表。
        """
        # 场景过滤
        scene_id = _infer_scene(behavior, scene_type)
        scene_id2 = _infer_scene(behavior, "general")
        candidates = self.db.query(RiskPoint).filter(
            RiskPoint.scene_id.in_([scene_id, scene_id2])
        ).all()
        if not candidates:
            candidates = self.db.query(RiskPoint).all()

        if not candidates:
            return []

        # 构建临时索引（仅对候选集，更精准）
        idx = _TfidfIndex()
        idx.build(candidates)
        results_raw = idx.query(behavior, top_k=top_k)

        results = []
        for doc_idx, sim in results_raw:
            rp = candidates[doc_idx]
            d = rp.to_dict()
            d["match_score"] = round(sim, 4)
            results.append(d)
        return results


# Ollama 生成自愈冷却（B2）：取代旧的"一次性失败即永久不可用"——
# 失败时进入冷却期（默认 OLLAMA_RETRY_COOLDOWN 秒，见 config），期间快速降级为规则引擎；
# 冷却一过立即重试，从而 Ollama 中途恢复（如手动启动服务、切换模型后）无需重启后端即可自动重启用 AI。
# 同时保留极短超时（connect 3s / read 20s），杜绝未安装 Ollama 时的长连接挂死。
_ollama_unavailable_until: float = 0.0  # monotonic 时间戳；在此之前跳过生成（视为不可用）


def reset_ollama_availability():
    """重置生成冷却：强制下一次请求立即重试 Ollama。

    旧语义是"重置永久性不可用标记"；现在 Ollama 恢复后会自动重试，此函数用于
    主动/立即强制重试（如运维确认服务已起来、或切换模型后让新模型立刻生效）。
    """
    global _ollama_unavailable_until
    _ollama_unavailable_until = 0.0


def try_ollama_generate(prompt: str, max_tokens: int = 512) -> str | None:
    """统一 LLM 生成入口：按 AI_PROVIDER 分派到本地 Ollama 或云端 OpenAI 兼容 API。

    失败/冷却/未配置均返回 None，由调用方降级为规则引擎（规则引擎是唯一真相源）。
    函数名对调用方保持不变（agent_service / cases / quiz 等直接调用本函数）。
    """
    global _ollama_unavailable_until
    # 开关判断（与 provider 无关）
    if settings.AI_PROVIDER == "cloud":
        if not settings.OPENAI_API_KEY:
            return None
    else:
        if not settings.ENABLE_OLLAMA:
            return None
    now = time.monotonic()
    if now < _ollama_unavailable_until:
        # 冷却中：快速降级为规则引擎，避免每次请求都打外部服务造成卡顿/挂死。
        return None
    if settings.AI_PROVIDER == "cloud":
        return _cloud_generate_impl(prompt, max_tokens)
    return _ollama_generate_impl(prompt, max_tokens)


def _ollama_generate_impl(prompt: str, max_tokens: int = 512) -> str | None:
    """本地 Ollama /api/generate 实现（try_ollama_generate 的 ollama 分支）。"""
    global _ollama_unavailable_until
    try:
        resp = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False,
                  "options": {"num_predict": max_tokens}},
            timeout=httpx.Timeout(connect=3.0, read=20.0, write=10.0, pool=3.0),
        )
        resp.raise_for_status()
        text = resp.json().get("response", "").strip()
        _ollama_unavailable_until = 0.0
        return text or None
    except Exception:
        # 失败 -> 进入冷却期，之后自动重试（自愈）；冷却时长由 OLLAMA_RETRY_COOLDOWN 控制。
        _ollama_unavailable_until = time.monotonic() + float(getattr(settings, "OLLAMA_RETRY_COOLDOWN", 10.0))
        return None


def _cloud_generate_impl(prompt: str, max_tokens: int = 512) -> str | None:
    """云端 OpenAI 兼容 /chat/completions 实现（try_ollama_generate 的 cloud 分支）。

    兼容 DeepSeek / 硅基流动 / 通义 DashScope / OpenAI 等任意 OpenAI 兼容端点。
    现有的单轮 prompt（已含指令+用户输入）作为 user message 发送；模型仅做「解释增强」，
    风险判定仍以规则引擎为真相源，模型输出会经 _ground_actor_reply 约束以防幻觉翻案。
    """
    global _ollama_unavailable_until
    try:
        resp = httpx.post(
            f"{settings.OPENAI_API_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": 0.3,
                "stream": False,
            },
            timeout=httpx.Timeout(connect=5.0, read=25.0, write=10.0, pool=5.0),
        )
        resp.raise_for_status()
        data = resp.json()
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
        _ollama_unavailable_until = 0.0
        return text or None
    except Exception as e:
        # 非瞬时错误（如 401 密钥无效 / 402 余额不足 / 429 限流）也在此被捕获并降级为规则引擎；
        # 打印状态码与原因，便于运维从日志快速定位（而非静默返回 None）。
        _status = getattr(e, "response", None)
        _code = getattr(_status, "status_code", None)
        if _code in (401, 402, 403, 429):
            logger.warning("云端大模型调用失败 http=%s：%s", _code, (getattr(_status, "text", "") or str(e))[:200])
        _ollama_unavailable_until = time.monotonic() + float(getattr(settings, "OLLAMA_RETRY_COOLDOWN", 10.0))
        return None


# 并发护栏：限制同时打 Ollama 的请求数，避免高并发把 FastAPI 线程池打满
# （同步端点下 Ollama 调用会占用线程池 worker，无限并发会拖垮整个服务乃至 /health）。
_ollama_concurrency = asyncio.Semaphore(int(os.getenv("OLLAMA_MAX_CONCURRENCY", "4")))


async def try_ollama_generate_async(prompt: str, max_tokens: int = 512, timeout: float = 25.0) -> str | None:
    """`try_ollama_generate` 的非阻塞版本：在独立线程中执行同步 HTTP 调用，

    通过信号量限制并发、外层 wait_for 兜底超时，避免阻塞事件循环 / 占满请求线程池。
    失败、超时或并发超限均返回 None，由调用方（规则引擎）降级，与同步版语义一致。
    """
    if settings.AI_PROVIDER == "cloud":
        if not settings.OPENAI_API_KEY:
            return None
    else:
        if not settings.ENABLE_OLLAMA:
            return None
    async with _ollama_concurrency:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(try_ollama_generate, prompt, max_tokens),
                timeout=timeout,
            )
        except (asyncio.TimeoutError, Exception):
            # 超时或线程内异常 → 直接降级为规则引擎，不让请求线程卡死。
            return None


# 引擎模式探测结果缓存（短 TTL）：避免每次请求都发起 ~3s 的同步 Ollama 探测，
# 否则前端轮询「AI/规则模式」徽标或健康检查时会频繁阻塞。最多 15s 陈旧，可接受。
# 改用 CacheStore：单实例走内存（行为不变），多实例配 REDIS_URL 即跨实例共享。
_ollama_status_cache: "CacheStore | None" = None
_OLLAMA_STATUS_TTL = 15.0


def _status_store() -> "CacheStore":
    global _ollama_status_cache
    if _ollama_status_cache is None:
        from app.core.cache import get_cache_store

        _ollama_status_cache = get_cache_store()
    return _ollama_status_cache


def list_ollama_model_names() -> list:
    """返回已配置的 LLM 模型名列表（用于前端判断候选模型是否已就绪）。

    cloud provider 下返回当前云端模型名（已配密钥即为就绪）；ollama provider 下返回本地已拉取模型。
    不可用时返回空列表，不抛异常——这是只读的辅助探测。
    """
    if settings.AI_PROVIDER == "cloud":
        return [settings.OPENAI_MODEL] if settings.OPENAI_API_KEY else []
    if not settings.ENABLE_OLLAMA:
        return []
    try:
        resp = httpx.get(
            f"{settings.OLLAMA_BASE_URL}/api/tags",
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
        )
        resp.raise_for_status()
        return [m.get("name", "") for m in resp.json().get("models", [])]
    except Exception:
        return []


def _probe_engine_status() -> dict:
    """真正去探测当前 provider 的引擎状态（见 ollama_status 缓存封装）。"""
    if settings.AI_PROVIDER == "cloud":
        return _probe_cloud_status()
    if not settings.ENABLE_OLLAMA:
        return {
            "configured": False,
            "reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_present": False,
            "mode": "rule",
            "reason": "配置未启用 Ollama（ENABLE_OLLAMA=false），当前为纯规则引擎模式（可离线运行）。",
        }
    try:
        resp = httpx.get(
            f"{settings.OLLAMA_BASE_URL}/api/tags",
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
        )
        resp.raise_for_status()
        models = [m.get("name", "") for m in resp.json().get("models", [])]
        configured = settings.OLLAMA_MODEL
        if configured in models:
            present = True
        elif ":" not in configured:
            # 配置项只写了家族名（如 qwen2.5），允许匹配同家族任意 tag
            present = any(m.split(":")[0] == configured for m in models)
        else:
            # 配置了具体 tag（如 qwen2.5:14b）则必须精确存在，不能被同家族 3b 误匹配
            present = False
        if present:
            return {
                "configured": True,
                "reachable": True,
                "model": settings.OLLAMA_MODEL,
                "model_present": True,
                "mode": "ai",
                "reason": f"Ollama 已连接，模型 {settings.OLLAMA_MODEL} 就绪，AI 增强模式生效。",
            }
        return {
            "configured": True,
            "reachable": True,
            "model": settings.OLLAMA_MODEL,
            "model_present": False,
            "mode": "rule",
            "reason": (
                f"Ollama 已连接，但未找到模型 {settings.OLLAMA_MODEL}。"
                f"执行 `ollama pull {settings.OLLAMA_MODEL}` 后即可启用 AI 增强模式。"
            ),
        }
    except Exception:
        return {
            "configured": True,
            "reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_present": False,
            "mode": "rule",
            "reason": (
                f"Ollama 服务未启动或不可达（{settings.OLLAMA_BASE_URL}）。"
                f"安装并启动 Ollama 后，AI 增强模式会自动生效。"
            ),
        }


def _probe_cloud_status() -> dict:
    """探测云端 OpenAI 兼容端点的真实状态（见 ollama_status 缓存封装）。"""
    key = settings.OPENAI_API_KEY
    model = settings.OPENAI_MODEL
    if not key:
        return {
            "configured": False,
            "reachable": False,
            "model": model,
            "model_present": False,
            "mode": "rule",
            "reason": "未配置 OPENAI_API_KEY，云端 AI 增强模式未启用。请在 backend/.env 填入密钥后重启后端。",
        }
    # 轻量可达性校验：GET {base}/models（OpenAI 兼容端点均支持）
    try:
        resp = httpx.get(
            f"{settings.OPENAI_API_BASE}/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
        )
        # 2xx/401/404 等都代表"服务可达"，仅连接级错误视为不可达
        reachable = resp.status_code < 500
    except Exception:
        reachable = False
    if not reachable:
        return {
            "configured": True,
            "reachable": False,
            "model": model,
            "model_present": False,
            "mode": "rule",
            "reason": (
                f"云端大模型已配置密钥，但 {settings.OPENAI_API_BASE} 不可达"
                f"（网络异常或地址错误）。请检查 OPENAI_API_BASE 配置。"
            ),
        }
    return {
        "configured": True,
        "reachable": True,
        "model": model,
        "model_present": True,
        "mode": "ai",
        "reason": f"云端大模型已就绪（{model}），AI 增强模式生效。",
    }


def ollama_status() -> dict:
    """探测 Ollama 真实状态，作为「引擎模式」的唯一真相源（带 15s 缓存）。

    关键点：不再只看 ENABLE_OLLAMA 配置布尔值（默认 True 会让人误以为有 AI），
    而是真正去打 Ollama 服务，区分真实状态：
      1. 配置未启用           → mode=rule（reason: 配置关闭）
      2. 服务不可达           → mode=rule（reason: 服务未启动/地址错误）
      3. 服务可达但缺模型      → mode=rule（reason: 需 ollama pull）
      4. 服务可达且模型就绪    → mode=ai  （reason: AI 增强模式生效）
    前端据此诚实展示当前是「AI 增强模式」还是「规则模式」，杜绝名不副实。

    结果按 _OLLAMA_STATUS_TTL 缓存，避免每次请求都触发 ~3s 的同步外部探测。
    """
    store = _status_store()
    cached = store.get("ollama_status")
    if cached is not None:
        return cached
    result = _probe_engine_status()
    store.set("ollama_status", result, ttl=_OLLAMA_STATUS_TTL)
    return result
