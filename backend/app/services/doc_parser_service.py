"""文档解析服务：PDF/Word/TXT 文本抽取 + 风险点提取（规则兜底）。"""
from pathlib import Path
from typing import List

from app.models.risk_point import RiskPoint
from app.services.rag_service import _infer_scene
from sqlalchemy.orm import Session

# 简单规则：从规范文本中抽取疑似禁止/错误行为行
_RISK_PATTERNS = ["不得", "禁止", "严禁", "不应", "必须", "不准", "切勿", "禁止使用", "严禁在"]


def extract_text(file_path: str) -> str:
    """按扩展名抽取文档纯文本。"""
    suffix = Path(file_path).suffix.lower()
    if suffix == ".pdf":
        from pypdf2 import PdfReader
        reader = PdfReader(file_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix in (".docx", ".doc"):
        import docx
        doc = docx.Document(file_path)
        return "\n".join(p.text for p in doc.paragraphs)
    # txt / md 等
    return Path(file_path).read_text(encoding="utf-8", errors="ignore")


def extract_risk_points(text: str, scene_type: str = "general") -> List[dict]:
    """从文本中抽取疑似风险点；无命中时给出通用兜底。"""
    results = []
    seen = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or len(line) < 8 or len(line) > 200:
            continue
        if any(p in line for p in _RISK_PATTERNS):
            key = line[:20]
            if key in seen:
                continue
            seen.add(key)
            level = "high" if any(p in line for p in ["严禁", "禁止", "不得"]) else "medium"
            results.append({
                "scene_id": _infer_scene(line, scene_type),
                "description": line[:150],
                "level": level,
                "weight": 0.9 if level == "high" else 0.6,
                "clause_ref": line[:200],
            })
        if len(results) >= 20:
            break
    if not results:
        results.append({
            "scene_id": _infer_scene("通用作业", scene_type),
            "description": "未从文档中识别出明确禁止条款，建议人工补充风险点",
            "level": "low",
            "weight": 0.4,
            "clause_ref": "文档解析提示：未能提取有效条款，请人工审核。",
        })
    return results


def save_risk_points(db: Session, doc_id: int, risks: List[dict]) -> int:
    count = 0
    for item in risks:
        db.add(RiskPoint(
            doc_id=doc_id,
            scene_id=item["scene_id"],
            description=item["description"],
            level=item["level"],
            weight=item["weight"],
            clause_ref=item["clause_ref"],
        ))
        count += 1
    db.commit()
    return count
