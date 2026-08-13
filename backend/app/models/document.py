"""上传的规范文档模型。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    file_path = Column(String(512), nullable=False)
    scene_type = Column(String(64), default="general")  # experiment / workshop / general
    uploaded_by = Column(Integer, default=0)
    status = Column(String(32), default="pending")  # pending / processing / done / failed
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "file_path": self.file_path,
            "scene_type": self.scene_type,
            "uploaded_by": self.uploaded_by,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
