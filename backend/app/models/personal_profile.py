"""个人避错画像模型（快照）。"""
from sqlalchemy import Column, DateTime, Float, Integer, String, func

from app.database import Base


class PersonalProfile(Base):
    __tablename__ = "personal_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, unique=True, index=True, nullable=False)
    high_freq_errors = Column(String(4096), default="[]")  # JSON 高频错误
    weaknesses = Column(String(4096), default="[]")        # JSON 薄弱点
    pass_rate = Column(Float, default=0)                   # 达标率 0-100
    total_records = Column(Integer, default=0)
    avoided_count = Column(Integer, default=0)
    avg_risk_score = Column(Float, default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self, brief: bool = False):
        import json
        try:
            high_freq = json.loads(self.high_freq_errors or "[]")
        except Exception:
            high_freq = []
        try:
            weaknesses = json.loads(self.weaknesses or "[]")
        except Exception:
            weaknesses = []
        if brief:
            high_freq = high_freq[:3]
            weaknesses = weaknesses[:3]
        data = {
            "user_id": self.user_id,
            "high_freq_errors": high_freq,
            "weaknesses": weaknesses,
            "pass_rate": self.pass_rate,
            "total_records": self.total_records,
            "avoided_count": self.avoided_count,
            "avg_risk_score": self.avg_risk_score,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "summary": f"累计推演 {self.total_records} 次，达标率 {self.pass_rate:.0f}%",
        }
        return data
