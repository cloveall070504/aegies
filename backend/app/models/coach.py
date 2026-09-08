"""数字人教练：跨场景长期记忆、形象/声音偏好、成就系统。

这些模型支撑《数字人功能规划》中的多项能力：
  - 跨场景长期记忆（项5）：薄弱知识点 / 常犯错误类型统计，跨模块共享
  - 形象/声音定制（项9）：性别、声音类型、语速偏好
  - 成就系统（项10）：完成的实验数、规避的事故数、已解锁徽章
  - 学习状态（项4/项8）：最近一次评估的状态，用于节奏/语速自适应
"""
from datetime import datetime, timezone

from sqlalchemy import (Boolean, Column, DateTime, Float, Integer, JSON, String,
                       Text, ForeignKey)
from sqlalchemy.sql import func

from app.database import Base


def _iso(dt):
    """序列化 datetime 为带 UTC 时区的 ISO 字符串（与 learning.py 保持一致）。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class StudentCoachProfile(Base):
    """每个学生的数字人教练画像（一对一）。"""

    __tablename__ = "student_coach_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    # —— 跨场景长期记忆（项5）——
    weak_topics = Column(JSON, nullable=False, default=lambda: [])       # [{"topic": str, "count": int}]
    error_type_counts = Column(JSON, nullable=False, default=lambda: {})  # {"概念错误": n, "操作习惯": n, ...}

    # —— 形象/声音定制（项9）——
    prefs = Column(JSON, nullable=False, default=lambda: {})             # {"gender":, "voice_type":, "speech_rate":}

    # —— 学习状态（项4 / 项8）——
    last_state = Column(String(16), nullable=False, default="流畅")
    last_state_at = Column(DateTime, nullable=True)

    # —— 成就（项10）——
    experiments_done = Column(Integer, nullable=False, default=0)
    incidents_avoided = Column(Integer, nullable=False, default=0)
    badges = Column(JSON, nullable=False, default=lambda: [])            # [badge_code]

    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "weak_topics": self.weak_topics or [],
            "error_type_counts": self.error_type_counts or {},
            "prefs": self.prefs or {},
            "last_state": self.last_state,
            "last_state_at": _iso(self.last_state_at),
            "experiments_done": self.experiments_done,
            "incidents_avoided": self.incidents_avoided,
            "badges": self.badges or [],
        }


class CoachBadge(Base):
    """成就徽章目录（系统预置，落库便于扩展与 i18n）。"""

    __tablename__ = "coach_badges"

    id = Column(Integer, primary_key=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(128), nullable=False, default="")
    desc = Column(String(256), nullable=False, default="")
    icon = Column(String(32), nullable=False, default="🏅")

    def to_dict(self):
        return {
            "code": self.code,
            "name": self.name,
            "desc": self.desc,
            "icon": self.icon,
        }
