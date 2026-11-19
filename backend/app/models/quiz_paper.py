"""随堂测验卷模型：教师一键组卷生成的试卷。"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.database import Base


class QuizPaper(Base):
    __tablename__ = "quiz_papers"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)              # 测验卷标题
    scene_code = Column(String(64), default="")              # 抽题来源场景（空=不限场景）
    question_ids = Column(Text, default="[]")                # JSON 数组：抽中的题目 id（内置题字符串 id / 导入题数值 id）
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)  # 组卷教师
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        import json
        try:
            ids = json.loads(self.question_ids) if self.question_ids else []
        except Exception:
            ids = []
        return {
            "id": self.id,
            "title": self.title,
            "scene_code": self.scene_code,
            "question_ids": ids,
            "question_count": len(ids),
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
