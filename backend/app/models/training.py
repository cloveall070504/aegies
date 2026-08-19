"""培训考核记录模型：预考分 → 学习完成 → 考核分，形成培训前后对比。"""
import json
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func

from app.database import Base


class TrainingRecord(Base):
    __tablename__ = "training_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    scene_code = Column(String(64), ForeignKey("scenes.scene_code"), index=True, nullable=False)

    # 阶段：pre（预考，未学习前）→ learning（学习中，可重复做模拟）→ post（考核，正式算分）→ done（完成）
    stage = Column(String(16), default="pre")

    # 预考（模拟分步骤，按做错的步骤数打分）
    pre_score = Column(Float, default=0.0)
    pre_steps = Column(Text, default="[]")     # JSON：预考每步骤详情 [{step_id, choice, correct, wrong_idx...}]
    pre_at = Column(DateTime)

    # 学习（模拟次数，允许反复练习）
    sim_count = Column(Integer, default=0)

    # 考核
    post_score = Column(Float, default=0.0)
    post_steps = Column(Text, default="[]")
    post_at = Column(DateTime)

    # 培训结果
    pass_ = Column("pass", Integer, default=0)  # 1=通过（post>=60 且 post > pre），0=未通过
    weakness = Column(Text, default="[]")       # 薄弱步骤 ID 列表 JSON
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "scene_code": self.scene_code,
            "stage": self.stage,
            "pre_score": self.pre_score,
            "post_score": self.post_score,
            "improvement": round((self.post_score or 0) - (self.pre_score or 0), 1),
            "sim_count": self.sim_count,
            "pass": bool(self.pass_),
            "weakness": json.loads(self.weakness) if self.weakness else [],
            "pre_at": self.pre_at.isoformat() if self.pre_at else None,
            "post_at": self.post_at.isoformat() if self.post_at else None,
            "created_at": self.created_at.isoformat(),
        }
