"""错误案例库模型：高频错误自动收录，支持人工审核。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class CaseEntry(Base):
    __tablename__ = "case_entries"

    id = Column(Integer, primary_key=True, index=True)
    behavior = Column(String(1024), nullable=False)                 # 错误行为描述（如"未验纯就点燃氢气"）
    risk_level = Column(String(16), default="medium")               # 风险等级：high / medium / low
    frequency = Column(Integer, default=1)                          # 出现频次（用于"高频错误"排序）
    status = Column(String(32), default="pending")                  # 审核状态：pending / approved / rejected
    source = Column(String(128), default="")                        # 来源：user / auto / doc
    scene_type = Column(String(64), default="general")              # 场景类型：experiment / general
    analysis = Column(String(2048), default="")                     # 案例解析（后果 + 正确做法）
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "behavior": self.behavior,
            "risk_level": self.risk_level,
            "frequency": self.frequency,
            "status": self.status,
            "source": self.source,
            "scene_type": self.scene_type,
            "analysis": self.analysis,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
