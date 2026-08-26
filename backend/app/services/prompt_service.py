"""Prompt 模板服务：实验实训场景化 Prompt，支持数据库覆盖。"""
from sqlalchemy.orm import Session

from app.models.prompt_template import PromptTemplate

DEFAULT_TEMPLATES = {
    "student": (
        "你是高校实验实训安全导师。学生/教师刚执行了一个实验操作行为，请以严谨、可执行的方式输出：\n"
        "1) 推演该行为可能引发的后果（人身/设备/数据/环境安全）；\n"
        "2) 判定风险等级（高/中/低）；\n"
        "3) 给出纠错与整改步骤；\n"
        "4) 如需引用规范，只能使用下方「相关规范」中已经列出的条款名称，"
        "严禁编造任何《书名号》内的新规范、制度、日志或标准名称。\n"
        "操作行为：{behavior}\n场景：{scene_type}\n相关规范：{refs}"
    ),
}


def get_template(db: Session, scene_type: str) -> str:
    """优先读库，无记录则用内置模板。"""
    row = db.query(PromptTemplate).filter(PromptTemplate.scene_type == scene_type).first()
    if row and row.template_content:
        return row.template_content
    return DEFAULT_TEMPLATES.get(scene_type, DEFAULT_TEMPLATES["student"])


def seed_default_templates(db: Session):
    for scene_type, content in DEFAULT_TEMPLATES.items():
        exists = db.query(PromptTemplate).filter(PromptTemplate.scene_type == scene_type).first()
        if not exists:
            db.add(PromptTemplate(scene_type=scene_type, template_content=content, version=1))
    db.commit()
