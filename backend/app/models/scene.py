"""场景配置模型：面向实验实训场景（学生/实验教师/实训中心管理员），支持任意自定义场景。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class Scene(Base):
    """场景配置：每个场景有独立的图标、配色、风险风格、内置步骤。

    内置场景（seed写入，不能删除）：
      - chem_lab     化学实验（学生实验蓝色主题）
    自定义场景（用户创建，可删除编辑）：
      - 任意化学相关实验/实训流程
    """
    __tablename__ = "scenes"

    id = Column(Integer, primary_key=True, index=True)
    scene_code = Column(String(64), unique=True, index=True)     # 短标识：chem_lab ...
    name = Column(String(128), nullable=False)                    # 显示名：化学实验场景
    icon = Column(String(32), default="📋")                        # emoji 图标
    category = Column(String(32), default="custom")               # experiment | general | custom
    description = Column(String(512), default="")                 # 场景描述
    theme_name = Column(String(32), default="student")            # 绑定的主题：统一 student 蓝白实验主题
    builtin = Column(Integer, default=0)                           # 1=内置不可删，0=自定义
    created_by = Column(Integer, default=0)                        # 创建者用户 ID（自定义场景）
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self, step_count: int | None = None):
        d = {
            "id": self.id,
            "scene_code": self.scene_code,
            "name": self.name,
            "icon": self.icon,
            "category": self.category,
            "description": self.description,
            "theme_name": self.theme_name,
            "builtin": bool(self.builtin),
        }
        if step_count is not None:
            d["step_count"] = step_count
        return d
