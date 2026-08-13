"""风险点模型：由文档自动抽取或内置，含向量索引。"""
from sqlalchemy import Column, DateTime, Float, Integer, String, func

from app.database import Base


class RiskPoint(Base):
    __tablename__ = "risk_points"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, default=0)
    scene_id = Column(String(64), default="general")
    description = Column(String(1024), nullable=False)      # 风险点描述（禁止/错误行为）
    level = Column(String(16), default="medium")            # high / medium / low
    weight = Column(Float, default=0.5)                     # 规范权重 0-1
    clause_ref = Column(String(512), default="")            # 条款溯源（原文引用）
    vector_id = Column(String(128), default="")
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self, brief: bool = False):
        data = {
            "id": self.id,
            "doc_id": self.doc_id,
            "scene_id": self.scene_id,
            "description": self.description,
            "level": self.level,
            "weight": self.weight,
            "clause_ref": self.clause_ref,
            "vector_id": self.vector_id,
        }
        if brief:
            data.pop("clause_ref", None)
            data.pop("vector_id", None)
        return data
