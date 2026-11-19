"""报告生成服务：个人/组织培训记录与风险掌握度报告（PDF）。

改进点：
- 风险等级分布饼图
- 风险趋势折线图
- 培训前后对比柱状图
- 使用 reportlab 内置图表组件，无需额外依赖
"""
import json
from datetime import datetime
from pathlib import Path

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

from app.config import settings
from app.models.operation_record import OperationRecord
from app.models.org_profile import OrgProfile
from app.models.personal_profile import PersonalProfile
from app.models.quiz_record import QuizRecord
from app.models.training import TrainingRecord
from app.models.user import User
from sqlalchemy.orm import Session

# 配色
C_HIGH = colors.HexColor("#E53E3E")
C_MED = colors.HexColor("#F59E0B")
C_LOW = colors.HexColor("#10B981")
C_ACCENT = colors.HexColor("#4F8CFF")
C_GRID = colors.HexColor("#E2E8F0")
C_TEXT = colors.HexColor("#1A202C")
C_MUTED = colors.HexColor("#718096")


def _styles():
    styles = getSampleStyleSheet()
    title = ParagraphStyle("CNTitle", parent=styles["Title"], fontSize=18, leading=24, textColor=C_TEXT)
    h2 = ParagraphStyle("CNH2", parent=styles["Heading2"], fontSize=14, leading=20, textColor=C_TEXT, spaceBefore=10, spaceAfter=6)
    body = ParagraphStyle("CNBody", parent=styles["BodyText"], fontSize=10.5, leading=16, textColor=C_TEXT)
    muted = ParagraphStyle("CNMuted", parent=body, fontSize=9, textColor=C_MUTED)
    return title, h2, body, muted


def _pie_chart(data: dict, width=260, height=180):
    """风险等级分布饼图。data: {"high": n, "medium": n, "low": n}"""
    drawing = Drawing(width, height)
    labels = []
    values = []
    colors_list = []
    if data.get("high", 0) > 0:
        labels.append("高危")
        values.append(data["high"])
        colors_list.append(C_HIGH)
    if data.get("medium", 0) > 0:
        labels.append("中危")
        values.append(data["medium"])
        colors_list.append(C_MED)
    if data.get("low", 0) > 0:
        labels.append("低危")
        values.append(data["low"])
        colors_list.append(C_LOW)

    if not values:
        values = [1]
        labels = ["暂无数据"]
        colors_list = [C_MUTED]

    pie = Pie()
    pie.x = 40
    pie.y = 20
    pie.width = 100
    pie.height = 100
    pie.data = values
    pie.labels = labels
    pie.slices.strokeWidth = 1
    pie.slices.strokeColor = colors.white
    for i, c in enumerate(colors_list):
        pie.slices[i].fillColor = c

    drawing.add(pie)

    # 图例
    for i, (label, val, c) in enumerate(zip(labels, values, colors_list)):
        ly = height - 30 - i * 16
        drawing.add(_rect(150, ly, 10, 10, c))
        drawing.add(String(166, ly + 1, f"{label}: {val}", fontSize=9, fillColor=C_TEXT))

    return drawing


def _rect(x, y, w, h, color):
    from reportlab.graphics.shapes import Rect
    r = Rect(x, y, w, h)
    r.fillColor = color
    r.strokeWidth = 0
    return r


def _line_chart(data_points: list, width=400, height=180):
    """风险趋势折线图。data_points: [(idx, score), ...]"""
    drawing = Drawing(width, height)

    if len(data_points) < 2:
        drawing.add(String(width // 2 - 40, height // 2, "数据不足，至少需要2次记录", fontSize=10, fillColor=C_MUTED))
        return drawing

    chart = LinePlot()
    chart.x = 40
    chart.y = 30
    chart.width = width - 60
    chart.height = height - 50

    # 转换坐标
    points = [(i, score) for i, (idx, score) in enumerate(data_points)]
    chart.data = [points]

    chart.lines[0].strokeColor = C_ACCENT
    chart.lines[0].strokeWidth = 2
    chart.lines[0].symbol = None

    chart.joinedLines = 1
    chart.fillColor = colors.HexColor("#EBF4FF")

    # X轴（LinePlot 使用 xValueAxis / yValueAxis，而非 categoryAxis / valueAxis）
    chart.xValueAxis.valueMin = 0
    chart.xValueAxis.valueMax = len(data_points) - 1
    chart.xValueAxis.valueStep = max(1, len(data_points) // 8)
    chart.xValueAxis.labels.fontSize = 8
    chart.xValueAxis.labels.fillColor = C_MUTED
    chart.xValueAxis.strokeColor = C_GRID

    # Y轴
    chart.yValueAxis.valueMin = 0
    chart.yValueAxis.valueMax = 100
    chart.yValueAxis.valueStep = 20
    chart.yValueAxis.labels.fontSize = 8
    chart.yValueAxis.labels.fillColor = C_MUTED
    chart.yValueAxis.strokeColor = C_GRID
    chart.yValueAxis.gridStrokeColor = C_GRID
    chart.yValueAxis.gridStrokeWidth = 0.5

    drawing.add(chart)
    drawing.add(String(width // 2 - 50, height - 12, "风险分趋势（越低越好）", fontSize=10, fillColor=C_TEXT))

    return drawing


def _bar_chart(data_pairs: list, width=300, height=180):
    """培训前后对比柱状图。data_pairs: [("标签", before_val, after_val), ...]"""
    drawing = Drawing(width, height)

    if not data_pairs:
        drawing.add(String(width // 2 - 40, height // 2, "暂无培训对比数据", fontSize=10, fillColor=C_MUTED))
        return drawing

    chart = VerticalBarChart()
    chart.x = 40
    chart.y = 30
    chart.width = width - 60
    chart.height = height - 50

    chart.data = [[b for _, b, _ in data_pairs], [a for _, _, a in data_pairs]]
    chart.categoryAxis.categoryNames = [label for label, _, _ in data_pairs]
    chart.categoryAxis.labels.fontSize = 8
    chart.categoryAxis.labels.fillColor = C_MUTED
    chart.categoryAxis.labels.angle = 0
    chart.categoryAxis.strokeColor = C_GRID

    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 100
    chart.valueAxis.valueStep = 20
    chart.valueAxis.labels.fontSize = 8
    chart.valueAxis.labels.fillColor = C_MUTED
    chart.valueAxis.strokeColor = C_GRID
    chart.valueAxis.gridStrokeColor = C_GRID
    chart.valueAxis.gridStrokeWidth = 0.5

    chart.bars[0].fillColor = C_HIGH
    chart.bars[1].fillColor = C_LOW
    chart.bars.strokeColor = colors.white
    chart.bars.strokeWidth = 1
    chart.barWidth = 12
    chart.groupSpacing = 16

    drawing.add(chart)

    # 图例
    drawing.add(_rect(40, height - 14, 10, 8, C_HIGH))
    drawing.add(String(54, height - 13, "培训前", fontSize=8, fillColor=C_TEXT))
    drawing.add(_rect(100, height - 14, 10, 8, C_LOW))
    drawing.add(String(114, height - 13, "培训后", fontSize=8, fillColor=C_TEXT))

    return drawing


def _write_pdf(path: Path, title_text: str, elements: list):
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
    )
    doc.build(elements)


def generate_personal_report(db: Session, user: User) -> str:
    """生成个人避错成长报告 PDF，返回文件路径。

    内容：个人画像（高频错误/薄弱点/达标率）+ 推演记录 + 自测成绩 + 培训前后对比。
    用 reportlab 生成，落盘到 settings.REPORT_DIR。
    """
    profile = db.query(PersonalProfile).filter(PersonalProfile.user_id == user.id).first()
    records = db.query(OperationRecord).filter(OperationRecord.user_id == user.id).order_by(OperationRecord.id).all()
    quizzes = db.query(QuizRecord).filter(QuizRecord.user_id == user.id).all()
    trainings = db.query(TrainingRecord).filter(TrainingRecord.user_id == user.id).all()

    now = datetime.now()
    fname = f"personal_report_{user.id}_{now:%Y%m%d_%H%M%S}.pdf"
    out = Path(settings.REPORT_DIR) / fname

    title, h2, body, muted = _styles()
    elements = [
        Paragraph(title_text := "个人避错成长报告", title),
        Spacer(1, 8),
        Paragraph(f"报告对象：{user.display_name or user.username}（{user.department or '-'}）", body),
        Paragraph(f"生成时间：{now:%Y-%m-%d %H:%M:%S}", muted),
        Spacer(1, 12),
    ]

    # ===== 概览数据 =====
    elements.append(Paragraph("一、数据概览", h2))
    overview_data = [
        ["指标", "数值"],
        ["累计推演/自查次数", str(len(records))],
        ["自测次数", str(len(quizzes))],
        ["培训记录数", str(len(trainings))],
        ["平均风险分", f"{profile.avg_risk_score if profile else 0}"],
        ["达标率", f"{profile.pass_rate if profile else 0}%"],
    ]
    t = Table(overview_data, colWidths=[120 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_ACCENT),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, C_GRID),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFC")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 16))

    # ===== 风险等级分布饼图 =====
    elements.append(Paragraph("二、风险等级分布", h2))
    dist = {"high": 0, "medium": 0, "low": 0}
    for r in records:
        level = getattr(r, "level", None) or "medium"
        if level in dist:
            dist[level] += 1
    elements.append(_pie_chart(dist))
    elements.append(Spacer(1, 16))

    # ===== 风险趋势折线图 =====
    elements.append(Paragraph("三、风险分趋势", h2))
    trend_points = [(i + 1, r.risk_score) for i, r in enumerate(records[-20:])]
    elements.append(_line_chart(trend_points))
    elements.append(Spacer(1, 16))

    # ===== 培训前后对比柱状图 =====
    elements.append(Paragraph("四、培训前后对比", h2))
    compare_pairs = []
    for tr in trainings:
        if tr.pre_score is not None and tr.post_score is not None:
            label = tr.scene_code[:8] if tr.scene_code else f"记录{tr.id}"
            compare_pairs.append((label, tr.pre_score, tr.post_score))
    if compare_pairs:
        elements.append(_bar_chart(compare_pairs[:6]))
    else:
        elements.append(Paragraph("暂无培训前后对比数据（需完成预考和考核）", muted))
    elements.append(Spacer(1, 16))

    # ===== 高频错误 =====
    elements.append(Paragraph("五、高频易错项", h2))
    try:
        hf = json.loads(profile.high_freq_errors or "[]") if profile else []
    except Exception:
        hf = []
    if hf:
        for item in hf[:5]:
            elements.append(Paragraph(f"- {item.get('behavior', '')}（{item.get('count', 0)} 次）", body))
    else:
        elements.append(Paragraph("暂无高频错误记录", muted))
    elements.append(Spacer(1, 12))

    # ===== 薄弱点 =====
    elements.append(Paragraph("六、薄弱点分析", h2))
    try:
        wk = json.loads(profile.weaknesses or "[]") if profile else []
    except Exception:
        wk = []
    if wk:
        for item in wk[:5]:
            elements.append(Paragraph(f"- {item.get('scene_type', '')}：平均风险分 {item.get('avg_score', 0)}", body))
    else:
        elements.append(Paragraph("暂无薄弱点数据", muted))
    elements.append(Spacer(1, 12))

    # ===== 结论 =====
    elements.append(Paragraph("七、结论与建议", h2))
    elements.append(Paragraph(
        "建议持续使用场景推演与自测功能，针对薄弱场景加强训练。"
        "重点关注高风险操作行为，确保培训前后风险分有显著下降。", body
    ))

    _write_pdf(out, title_text, elements)
    return str(out)


def generate_org_report(db: Session, org_id: str) -> str:
    """生成组织（班级/班组）风险画像报告 PDF，返回文件路径。

    内容：风险分布（高中低）、高频错误 Top、成员统计、培训前后平均风险对比。
    """
    org = db.query(OrgProfile).filter(OrgProfile.org_id == org_id).first()
    now = datetime.now()
    fname = f"org_report_{org_id}_{now:%Y%m%d_%H%M%S}.pdf"
    out = Path(settings.REPORT_DIR) / fname

    title, h2, body, muted = _styles()
    elements = [
        Paragraph("组织风险掌握度报告", title),
        Spacer(1, 8),
        Paragraph(f"组织：{org.org_name if org else org_id}", body),
        Paragraph(f"生成时间：{now:%Y-%m-%d %H:%M:%S}", muted),
        Spacer(1, 12),
    ]

    if org:
        # 风险分布饼图
        elements.append(Paragraph("一、风险等级分布", h2))
        try:
            dist = json.loads(org.risk_distribution or "{}")
        except Exception:
            dist = {}
        elements.append(_pie_chart(dist))
        elements.append(Spacer(1, 16))

        # 高频错误排行
        elements.append(Paragraph("二、高频错误排行", h2))
        try:
            tops = json.loads(org.top_errors or "[]")
        except Exception:
            tops = []
        if tops:
            for item in tops[:10]:
                elements.append(Paragraph(f"- {item.get('behavior', '')}（{item.get('count', 0)} 次）", body))
        else:
            elements.append(Paragraph("暂无高频错误数据", muted))
        elements.append(Spacer(1, 12))
    else:
        elements.append(Paragraph("暂无组织数据", muted))

    elements.append(Paragraph("三、结论与建议", h2))
    elements.append(Paragraph(
        "建议针对高风险项开展专项培训并跟踪整改闭环。"
        "定期复查培训效果，确保组织整体风险掌握度持续提升。", body
    ))

    _write_pdf(out, "组织风险掌握度报告", elements)
    return str(out)
