"""自测记录模型。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class QuizRecord(Base):
    __tablename__ = "quiz_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    quiz_id = Column(String(64), default="quiz_001")
    scene_code = Column(String(64), default="")           # 关联场景代码
    score = Column(Integer, default=0)              # 0-100
    total = Column(Integer, default=0)
    correct = Column(Integer, default=0)
    wrong_items = Column(String(4096), default="[]")  # JSON 错题列表
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "quiz_id": self.quiz_id,
            "scene_code": self.scene_code or "",
            "score": self.score,
            "total": self.total,
            "correct": self.correct,
            "wrong_items": self.wrong_items,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
