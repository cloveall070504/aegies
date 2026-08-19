"""作业/培训任务模型：教师布置 → 学生完成 → 教师查看进度。"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func

from app.database import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    scene_code = Column(String(64), default="")        # 指定场景，空=全部
    task_type = Column(String(32), default="sim_train") # sim_train | quiz | infer
    due_date = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    status = Column(String(16), default="active")       # active | closed
    # 教师批改
    score = Column(Float, default=0)                     # 教师评分
    comment = Column(Text, default="")                   # 教师评语
    graded_by = Column(Integer, default=0)               # 批改人 ID
    graded_at = Column(DateTime, nullable=True)          # 批改时间

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "scene_code": self.scene_code,
            "task_type": self.task_type,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "status": self.status,
            "score": self.score,
            "comment": self.comment,
            "graded_by": self.graded_by,
            "graded_at": self.graded_at.isoformat() if self.graded_at else None,
        }


class AssignmentProgress(Base):
    __tablename__ = "assignment_progress"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(16), default="pending")      # pending | in_progress | completed
    score = Column(Float, default=0)
    completed_at = Column(DateTime, nullable=True)
    # 教师批改
    comment = Column(Text, default="")                   # 教师评语
    graded = Column(Integer, default=0)                  # 0=未批改 1=已批改
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "assignment_id": self.assignment_id,
            "user_id": self.user_id,
            "status": self.status,
            "score": self.score,
            "comment": self.comment,
            "graded": bool(self.graded),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
