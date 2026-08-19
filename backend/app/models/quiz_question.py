"""导入题目模型：存储用户通过 JSON 文件导入的自测题目。"""
from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, index=True)
    scene_type = Column(String(32), default="general", index=True)   # chem_lab|general
    scene_code = Column(String(64), default="", index=True)          # 具体场景代码（chem_lab 等），空=通用
    question = Column(String(1024), nullable=False)                  # 题干
    options = Column(String(2048), nullable=False)                   # JSON 数组：选项列表
    answer = Column(Integer, default=0)                              # 正确选项索引（0-based）；judge 题 0=错/1=对
    qtype = Column(String(16), default="choice", server_default="choice")  # choice|judge|sequence|open
    answer_seq = Column(String(256), default="", server_default="")  # sequence 题：正确顺序 JSON 数组（索引排列）
    answer_text = Column(String(2048), default="", server_default="")  # open 题：参考答案（仅教师端/练习批改参考）
    analysis = Column(String(1024), default="")                      # 解析说明
    created_by = Column(Integer, default=0)                          # 导入用户 ID
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self, include_answer_text: bool = False):
        import json
        d = {
            "id": f"uq{self.id}",
            "scene_type": self.scene_type,
            "scene_code": self.scene_code or "",
            "question": self.question,
            "options": json.loads(self.options) if self.options else [],
            "answer": self.answer,
            "qtype": self.qtype or "choice",
            "answer_seq": json.loads(self.answer_seq) if self.answer_seq else [],
            "analysis": self.analysis,
        }
        if include_answer_text:
            d["answer_text"] = self.answer_text or ""
        return d
