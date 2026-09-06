"""数字人对话会话与消息（持久化到数据库）。

设计要点：
- Conversation：一次会话（用户可以开多个会话，类似"新对话"）
- ConversationMessage：单条消息（用户/AI 各一条）
- 会话标题自动取首条用户消息前 20 字
- 每个用户最多保留 20 个会话，超出自动归档最老的
- 消息内容截断 2000 字，防止极端长文本占库
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base

MAX_CONVERSATIONS_PER_USER = 20
MAX_MESSAGE_LENGTH = 2000


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    session_id = Column(String(64), index=True, nullable=False)  # 前端生成的会话标识
    title = Column(String(128), default="新对话")
    module = Column(String(64), default="")  # 会话发生在哪个模块（沙盘/案例等）
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    messages = relationship(
        "ConversationMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.id",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "title": self.title,
            "module": self.module,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "message_count": len(self.messages),
        }


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), index=True, nullable=False)
    role = Column(String(16), nullable=False)  # user / ai
    text = Column(Text, default="")
    intent = Column(String(32), default="chat")  # operation / qa / chat
    engine = Column(String(32), default="")  # rule / llm / rag / fallback
    level = Column(String(16), default="")  # high / medium / low（仅 operation 有）
    risk_score = Column(Integer, default=0)
    source_count = Column(Integer, default=0)
    meta_json = Column(Text, default="")  # 其他元数据（JSON 字符串，灵活扩展）
    created_at = Column(DateTime, server_default=func.now())

    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "role": self.role,
            "text": self.text,
            "meta": {
                "intent": self.intent,
                "engine": self.engine,
                "level": self.level,
                "risk_score": self.risk_score,
                "source_count": self.source_count,
            },
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
