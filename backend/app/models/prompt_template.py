"""Prompt 模板模型：化学实验(chem_lab)与通用(general)场景化模板。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    scene_type = Column(String(64), index=True, nullable=False)  # chem_lab / general
    template_content = Column(String(8192), nullable=False)
    version = Column(Integer, default=1)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "scene_type": self.scene_type,
            "template_content": self.template_content,
            "version": self.version,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
