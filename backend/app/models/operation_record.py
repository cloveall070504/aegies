"""操作记录模型：推演/自查记录。"""
from sqlalchemy import Column, DateTime, Float, Integer, String, func

from app.database import Base


class OperationRecord(Base):
    __tablename__ = "operation_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    behavior = Column(String(1024), nullable=False)
    scene_type = Column(String(64), default="general")
    scene_code = Column(String(64), default="")  # 具体场景代码（chem_lab/elec_lab 等）
    risk_score = Column(Float, default=0)
    level = Column(String(16), default="low")
    consequence = Column(String(2048), default="")
    correction = Column(String(2048), default="")
    ai_checked = Column(Integer, default=1)  # 1=自检通过
    critic_divergence = Column(Integer, default=0)  # 0=无分歧, 1=模型 Critic 与规则引擎存在分歧（仅提示，不影响 ai_checked）
    source_refs = Column(String(4096), default="[]")  # JSON 条款溯源列表
    score_breakdown = Column(String(4096), default="[]")  # JSON 评分明细（A3 透明化：每步加分项）
    # ===== A2 学生错误回流闭环 =====
    student_feedback = Column(String(2048), default="")   # 学生对本次判定的质疑/说明
    is_misjudge = Column(Integer, default=0)             # 1=学生认为判定有误
    feedback_status = Column(String(16), default="")      # ''=无 / pending=待教师处理 / resolved=已处理
    feedback_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "behavior": self.behavior,
            "scene_type": self.scene_type,
            "scene_code": self.scene_code or "",
            "risk_score": self.risk_score,
            "level": self.level,
            "consequence": self.consequence,
            "correction": self.correction,
            "ai_checked": self.ai_checked,
            "critic_divergence": int(self.critic_divergence or 0),
            "source_refs": self._parse_json(self.source_refs),
            "score_breakdown": self._parse_json(self.score_breakdown),
            "student_feedback": self.student_feedback or "",
            "is_misjudge": int(self.is_misjudge or 0),
            "feedback_status": self.feedback_status or "",
            "feedback_at": self.feedback_at.isoformat() if self.feedback_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    @staticmethod
    def _parse_json(v):
        if not v:
            return []
        try:
            import json
            return json.loads(v)
        except Exception:
            return []
