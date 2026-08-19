"""场景步骤模型：每个场景下的操作步骤，用于分步骤模拟培训。"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.database import Base


class SceneStep(Base):
    """场景操作步骤：一条正确操作 + 常见错误 + 后果 + 正确做法说明。

    模拟页面按 order 顺序展示每一步：
      用户看到 step_text（例如"第3步：加热试管"）后，从多个 options 里选正确的；
      选错了就展示 common_mistake + consequence，选对了展示 correct_action + explanation。
    """
    __tablename__ = "scene_steps"

    id = Column(Integer, primary_key=True, index=True)
    scene_code = Column(String(64), ForeignKey("scenes.scene_code"), index=True, nullable=False)
    step_order = Column(Integer, default=1)                                     # 步骤序号（从小到大展示）
    step_title = Column(String(256), nullable=False)                            # 步骤标题：第N步要做什么
    step_text = Column(Text, default="")                                        # 步骤详细描述（场景还原）
    options_json = Column(Text, nullable=False)                                 # 选项 JSON 数组：[{"label","correct","consequence","explanation"}]
    risk_level = Column(String(16), default="medium")                           # 本步骤风险等级：low/medium/high
    step_hint = Column(Text, default="")                                        # 提示说明
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        import json
        return {
            "id": self.id,
            "scene_code": self.scene_code,
            "step_index": self.step_order,
            "step_order": self.step_order,
            "step_title": self.step_title,
            "step_text": self.step_text,
            "options": json.loads(self.options_json) if self.options_json else [],
            "risk_level": self.risk_level,
            "step_hint": self.step_hint,
        }
