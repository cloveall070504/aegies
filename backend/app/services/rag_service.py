"""反向 RAG 检索服务：从规范文档/内置知识库中检索与行为相关的风险点。

反向 RAG：以「禁止/错误行为」建立风险反向索引，用户输入行为后检索最相近的风险点，
并将原始规范条款作为溯源引用返回。
"""
import json
from typing import List

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.risk_point import RiskPoint

# 内置风险知识库（冷启动兜底，普通电脑无需 Ollama 即可演示）
BUILTIN_RISK_POINTS = [
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
        "scene_id": "elec_lab",
        "description": "带电接线或带电更换元器件",
        "level": "high", "weight": 0.95,
        "clause_ref": "《电工电子实验室安全规程》2.4：严禁带电进行接线、改线等作业。",
    },
    {
        "scene_id": "elec_lab",
        "description": "使用破损绝缘层的导线连接电路",
        "level": "high", "weight": 0.85,
        "clause_ref": "《电工电子实验室安全规程》2.6：使用前必须检查导线绝缘层完好，破损导线严禁使用。",
    },
    {
        "scene_id": "workshop",
        "description": "未断电情况下直接清理运转中的机床切屑",
        "level": "high", "weight": 0.9,
        "clause_ref": "《机械加工车间安全操作规程》4.3：清理切屑必须停机断电，严禁用手直接清除。",
    },
    {
        "scene_id": "workshop",
        "description": "不戴防护手套搬运玻璃器皿或毛刺工件",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《车间劳动防护用品管理办法》第2章：接触毛刺、玻璃类工件须佩戴防护手套。",
    },
    {
        "scene_id": "workshop",
        "description": "在车间内未佩戴安全帽进入吊装作业区",
        "level": "high", "weight": 0.85,
        "clause_ref": "《企业安全生产规程》5.1：进入吊装作业区域必须佩戴安全帽并系好帽带。",
    },
    {
        "scene_id": "general",
        "description": "操作前未阅读安全规程直接开工",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《通用安全作业守则》1.1：作业前必须熟悉本岗位安全操作规程。",
    },
]

_KEYWORD_MAP = {
    "酸": "chem_lab", "试剂": "chem_lab", "试管": "chem_lab", "酒精灯": "chem_lab",
    "实验": "chem_lab", "化学品": "chem_lab", "烧杯": "chem_lab", "量筒": "chem_lab",
    "电": "elec_lab", "电路": "elec_lab", "接线": "elec_lab", "元器件": "elec_lab",
    "机床": "workshop", "车间": "workshop", "切屑": "workshop", "工件": "workshop",
    "吊装": "workshop", "焊接": "workshop", "打磨": "workshop", "装配": "workshop",
}


def _infer_scene(behavior: str, scene_type: str) -> str:
    if scene_type in ("experiment", "student"):
        if "电" in behavior or "电路" in behavior:
            return "elec_lab"
        return "chem_lab"
    if scene_type in ("workshop", "worker"):
        return "workshop"
    for kw, sid in _KEYWORD_MAP.items():
        if kw in behavior:
            return sid
    return "general"


def _similarity(text: str, keywords: List[str]) -> int:
    return sum(1 for kw in keywords if kw in text)


def _embed(text: str) -> List[float]:
    """尝试调用 sentence-transformers 做嵌入；失败返回空列表。"""
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(settings.EMBEDDING_MODEL)
        vec = model.encode(text).tolist()
        del model
        return vec
    except Exception:
        return []


class RAGService:
    def __init__(self, db: Session):
        self.db = db

    def _chroma_collection(self):
        try:
            import chromadb
            client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
            return client.get_or_create_collection("risk_points", metadata={"hnsw:space": "cosine"})
        except Exception:
            return None

    def seed_risk_points(self):
        """把内置风险点写入数据库（幂等）。"""
        if self.db.query(RiskPoint).count() > 0:
            return
        for item in BUILTIN_RISK_POINTS:
            self.db.add(RiskPoint(
                scene_id=item["scene_id"],
                description=item["description"],
                level=item["level"],
                weight=item["weight"],
                clause_ref=item["clause_ref"],
            ))
        self.db.commit()

    def search(self, behavior: str, scene_type: str = "experiment", top_k: int = 3) -> List[dict]:
        """按行为文本检索最相关风险点，返回含溯源的列表。"""
        scene_id = _infer_scene(behavior, scene_type)
        scene_id2 = _infer_scene(behavior, "general")
        candidates = self.db.query(RiskPoint).filter(
            RiskPoint.scene_id.in_([scene_id, scene_id2])
        ).all()
        if not candidates:
            candidates = self.db.query(RiskPoint).all()

        # 关键词打分排序（可扩展为向量检索）
        scored = []
        for rp in candidates:
            keywords = rp.description.replace("，", "").replace("。", "").split()
            score = _similarity(behavior, [kw for kw in rp.description if len(kw) >= 2])
            # 直接命中关键词加权
            for kw in rp.description:
                if len(kw) >= 2 and kw in behavior:
                    score += 3
            scored.append((score, rp))
        scored.sort(key=lambda x: -x[0])
        results = [rp.to_dict() for _, rp in scored[:top_k]]
        # 无命中时补充通用兜底
        if not results:
            general = self.db.query(RiskPoint).filter(RiskPoint.scene_id == "general").first()
            if general:
                results = [general.to_dict()]
        return results


def try_ollama_generate(prompt: str, max_tokens: int = 512) -> str | None:
    """调用本地 Ollama 生成文本；失败返回 None（由调用方降级）。"""
    if not settings.ENABLE_OLLAMA:
        return None
    try:
        resp = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False,
                  "options": {"num_predict": max_tokens}},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except Exception:
        return None
