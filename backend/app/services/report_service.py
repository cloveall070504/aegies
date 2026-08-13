"""报告生成服务：个人/组织培训记录与风险掌握度报告（PDF）。"""
import json
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.config import settings
from app.models.operation_record import OperationRecord
from app.models.org_profile import OrgProfile
from app.models.personal_profile import PersonalProfile
from app.models.quiz_record import QuizRecord
from app.models.user import User
from sqlalchemy.orm import Session


def _base_style():
    styles = getSampleStyleSheet()
    title = ParagraphStyle("CNTitle", parent=styles["Title"], fontSize=18, leading=24)
    body = ParagraphStyle("CNBody", parent=styles["BodyText"], fontSize=10.5, leading=16)
    return title, body


def _write_pdf(path: Path, title_text: str, blocks: list):
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm)
    title, body = _base_style()
    story = [Paragraph(title_text, title), Spacer(1, 8)]
    for block in blocks:
        story.append(Paragraph(block, body))
        story.append(Spacer(1, 6))
    doc.build(story)


def generate_personal_report(db: Session, user: User) -> str:
    profile = db.query(PersonalProfile).filter(PersonalProfile.user_id == user.id).first()
    records = db.query(OperationRecord).filter(OperationRecord.user_id == user.id).all()
    quizzes = db.query(QuizRecord).filter(QuizRecord.user_id == user.id).all()

    now = datetime.now()
    fname = f"personal_report_{user.id}_{now:%Y%m%d_%H%M%S}.pdf"
    out = Path(settings.REPORT_DIR) / fname

    blocks = [
        f"报告对象：{user.display_name or user.username}（{user.department or '-'}）",
        f"生成时间：{now:%Y-%m-%d %H:%M:%S}",
        f"累计推演/自查次数：{len(records)}；自测次数：{len(quizzes)}",
        f"平均风险分：{profile.avg_risk_score if profile else 0}；达标率：{profile.pass_rate if profile else 0}%",
        "高频错误：",
    ]
    try:
        hf = json.loads(profile.high_freq_errors or "[]") if profile else []
    except Exception:
        hf = []
    blocks += [f"- {item.get('behavior', '')}（{item.get('count', 0)} 次）" for item in hf[:5]] or ["- 暂无"]

    blocks.append("近期待提升薄弱点：")
    try:
        wk = json.loads(profile.weaknesses or "[]") if profile else []
    except Exception:
        wk = []
    blocks += [f"- {item.get('scene_type', '')}：平均风险分 {item.get('avg_score', 0)}" for item in wk[:5]] or ["- 暂无"]

    blocks.append("结论：建议持续使用场景推演与自测功能，针对薄弱场景加强训练。")
    _write_pdf(out, "个人避错成长报告", blocks)
    return str(out)


def generate_org_report(db: Session, org_id: str) -> str:
    org = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    now = datetime.now()
    fname = f"org_report_{org_id}_{now:%Y%m%d_%H%M%S}.pdf"
    out = Path(settings.REPORT_DIR) / fname

    blocks = [f"组织：{org.org_name if org else org_id}", f"生成时间：{now:%Y-%m-%d %H:%M:%S}"]
    if org:
        try:
            dist = json.loads(org.risk_distribution or "{}")
            blocks.append(f"风险分布：高风险 {dist.get('high', 0)}、中风险 {dist.get('medium', 0)}、低风险 {dist.get('low', 0)}")
        except Exception:
            pass
        try:
            tops = json.loads(org.top_errors or "[]")
            blocks.append("高频错误排行：")
            blocks += [f"- {item.get('behavior', '')}（{item.get('count', 0)} 次）" for item in tops[:10]]
        except Exception:
            pass
    blocks.append("结论：建议针对高风险项开展专项培训并跟踪整改闭环。")
    _write_pdf(out, "组织风险掌握度报告", blocks)
    return str(out)
