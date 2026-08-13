"""用户模型：学生/工人/教师/安全员/管理员。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), default="student")  # student/worker/teacher/safety/admin
    department = Column(String(128), default="")
    phone = Column(String(32), default="")
    display_name = Column(String(64), default="")
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "department": self.department,
            "phone": self.phone,
            "display_name": self.display_name or self.username,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
