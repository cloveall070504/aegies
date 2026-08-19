"""组织画像模型：班级/班组风险分布快照。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class OrgProfile(Base):
    __tablename__ = "org_profiles"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(String(128), index=True, nullable=False)   # 班级/班组标识
    org_name = Column(String(256), default="")
    risk_distribution = Column(String(4096), default="{}")     # JSON {high: n, medium: n, low: n}
    top_errors = Column(String(4096), default="[]")            # JSON 高频错误排行
    member_stats = Column(String(4096), default="{}")          # JSON 成员统计
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self, brief: bool = False):
        import json
        try:
            dist = json.loads(self.risk_distribution or "{}")
        except Exception:
            dist = {}
        try:
            top = json.loads(self.top_errors or "[]")
        except Exception:
            top = []
        try:
            stats = json.loads(self.member_stats or "{}")
        except Exception:
            stats = {}
        data = {
            "org_id": self.org_id,
            "org_name": self.org_name,
            "risk_distribution": dist,
            "top_errors": top,
            "member_stats": stats,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if brief:
            data = {
                "org_name": self.org_name,
                "total_high_risk": dist.get("high", 0),
                "member_count": stats.get("member_count", 0),
            }
        return data
