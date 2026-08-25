"""学习相关模型：错题复习计划（间隔重复）与站内消息中心。"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import (Boolean, Column, DateTime, Float, Integer, String,
                       UniqueConstraint)
from sqlalchemy.sql import func

from app.database import Base


def _default_next_review():
    """默认下次复习时间：1 天后（naive UTC，与查询比较保持一致）。"""
    return datetime.utcnow() + timedelta(days=1)


def _iso(dt):
    """序列化 datetime 为带 UTC 时区的 ISO 字符串，避免前端按本地时区解析导致时间偏差。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class ReviewItem(Base):
    """错题复习计划：按 (用户, 题目, 场景) 维度记录间隔重复状态。

    学员每答错一题即 upsert 一条记录，重置为 1 天后再复习；
    学员点击「完成复习」时按 SM-2 思路推后间隔，形成间隔重复。
    """

    __tablename__ = "review_items"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    item_id = Column(String(64), nullable=False, default="")
    scene_code = Column(String(64), nullable=False, default="")
    qtype = Column(String(16), nullable=False, default="choice")
    question_text = Column(String(1024), nullable=False, default="")
    interval_days = Column(Integer, nullable=False, default=1)
    repetitions = Column(Integer, nullable=False, default=0)
    ease = Column(Float, nullable=False, default=2.5)
    last_reviewed_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=False, default=_default_next_review, index=True)
    wrong_count = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "item_id", "scene_code", name="uq_review_item"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "item_id": self.item_id,
            "scene_code": self.scene_code,
            "qtype": self.qtype,
            "question_text": self.question_text,
            "interval_days": self.interval_days,
            "repetitions": self.repetitions,
            "ease": self.ease,
            "wrong_count": self.wrong_count,
            "last_reviewed_at": _iso(self.last_reviewed_at),
            "next_review_at": _iso(self.next_review_at),
        }


class Notification(Base):
    """站内消息：复习提醒 / 作业提醒 / 系统通知。"""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    type = Column(String(32), nullable=False, default="system")
    title = Column(String(256), nullable=False, default="")
    content = Column(String(1024), nullable=False, default="")
    related_url = Column(String(256), nullable=False, default="")
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "content": self.content,
            "related_url": self.related_url,
            "is_read": self.is_read,
            "created_at": _iso(self.created_at),
        }
