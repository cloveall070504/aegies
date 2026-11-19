"""报告模型：个人/组织培训记录与风险掌握度报告。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, default=0)                # 个人报告归属用户；组织报告为 0
    org_id = Column(String(128), default="")            # 组织报告归属的班级/班组标识
    type = Column(String(16), default="personal")       # 报告类型：personal / org
    title = Column(String(256), default="")             # 报告标题
    file_path = Column(String(512), default="")         # 生成的 PDF 文件路径（供下载）
    generated_at = Column(DateTime, server_default=func.now())  # 生成时间

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "org_id": self.org_id,
            "type": self.type,
            "title": self.title,
            "file_path": self.file_path,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }
