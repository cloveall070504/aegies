"""操作记录模型：推演/自查记录。"""
from sqlalchemy import Column, DateTime, Float, Integer, String, func

from app.database import Base


class OperationRecord(Base):
    __tablename__ = "operation_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    behavior = Column(String(1024), nullable=False)
    scene_type = Column(String(64), default="general")
    risk_score = Column(Float, default=0)
    level = Column(String(16), default="low")
    consequence = Column(String(2048), default="")
    correction = Column(String(2048), default="")
    ai_checked = Column(Integer, default=1)  # 1=自检通过
    source_refs = Column(String(4096), default="[]")  # JSON 条款溯源列表
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "behavior": self.behavior,
            "scene_type": self.scene_type,
            "risk_score": self.risk_score,
            "level": self.level,
            "consequence": self.consequence,
            "correction": self.correction,
            "ai_checked": self.ai_checked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
