"""个人画像接口。按场景过滤，并返回风险趋势。"""
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user
from app.database import get_db
from app.models.operation_record import OperationRecord
from app.models.personal_profile import PersonalProfile
from app.models.user import User
from app.services.profile_service import refresh_profile
from app.utils.response import ok

router = APIRouter(prefix="/profile", tags=["个人画像"])

# 内置化学实验场景代码（experiment/student 家族过滤时纳入统计）
_CHEM_SCENE_CODES = {"chem_lab", "chem_titration", "chem_gas_prep", "chem_distillation", "chem_solution_prep"}

# 场景类型中文名
_SCENE_LABELS = {
    "experiment": "实验场景", "student": "实验场景",
    "general": "通用场景",
}


def _scene_match(record_scene: str, filter_scene: str) -> bool:
    if not filter_scene or filter_scene == "general":
        return True
    if filter_scene in ("experiment", "student"):
        return record_scene in _CHEM_SCENE_CODES or record_scene in ("experiment", "student")
    return record_scene == filter_scene


@router.get("/personal")
def personal(
    scene_type: str = Query(default="", description="场景类型过滤"),
    scene_code: str = Query(default="", description="具体场景代码（chem_lab 等），优先于 scene_type"),
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_mobile = client_type == "mobile"
    refresh_profile(db, user.id)

    # 全量记录，按场景在前端过滤（保持画像完整）
    all_records = (
        db.query(OperationRecord)
        .filter(OperationRecord.user_id == user.id)
        .order_by(OperationRecord.id.desc())
        .all()
    )
    # scene_code 精确过滤优先
    if scene_code:
        scoped_records = [r for r in all_records if r.scene_code == scene_code]
    else:
        scoped_records = [r for r in all_records if _scene_match(r.scene_type, scene_type)]

    # 风险分布
    dist = {"high": 0, "medium": 0, "low": 0}
    for r in scoped_records:
        dist[r.level] = dist.get(r.level, 0) + 1
    avoided = dist["low"]

    # 高频错误
    behavior_counter = defaultdict(int)
    for r in scoped_records:
        behavior_counter[r.behavior[:30]] += 1
    high_freq = [{"behavior": b, "count": c} for b, c in
                 sorted(behavior_counter.items(), key=lambda x: -x[1])[:5]]

    # 薄弱点：按场景聚合高分记录
    scene_scores = defaultdict(list)
    for r in scoped_records:
        scene_scores[r.scene_type].append(r.risk_score)
    weaknesses = [
        {"scene_type": _SCENE_LABELS.get(s, s), "avg_score": round(sum(v) / len(v), 1)}
        for s, v in scene_scores.items() if v and sum(v) / len(v) >= 40
    ][:5]

    # 风险趋势：按时间正序，最近 10 次推演的风险分
    trend_records = sorted(scoped_records, key=lambda x: x.id)[-10:]
    trend = [
        {"idx": i + 1, "score": r.risk_score, "level": r.level,
         "time": r.created_at.isoformat() if r.created_at else None}
        for i, r in enumerate(trend_records)
    ]

    # 通过率：综合 quiz + 规避率（按当前场景过滤）
    from app.models.quiz_record import QuizRecord
    quiz_query = db.query(QuizRecord).filter(QuizRecord.user_id == user.id)
    if scene_code:
        quiz_query = quiz_query.filter(QuizRecord.scene_code == scene_code)
    elif scene_type:
        quiz_query = quiz_query.filter(QuizRecord.scene_type == scene_type)
    quizzes = quiz_query.all()
    quiz_rate = (sum(q.score for q in quizzes) / len(quizzes)) if quizzes else 0
    if scoped_records:
        avoid_rate = avoided / len(scoped_records) * 100
        pass_rate = round(quiz_rate * 0.6 + avoid_rate * 0.4, 1) if quizzes else round(avoid_rate, 1)
    else:
        pass_rate = round(quiz_rate, 1)

    # 提升率：最近 5 次平均风险分 vs 之前平均风险分的下降比例
    if len(trend_records) >= 2:
        recent_avg = sum(r.risk_score for r in trend_records[-5:]) / min(5, len(trend_records))
        older = scoped_records[:-5] if len(scoped_records) > 5 else []
        if older:
            older_avg = sum(r.risk_score for r in older) / len(older)
            improvement_rate = round(max(0, (older_avg - recent_avg) / older_avg * 100)) if older_avg > 0 else 0
        else:
            improvement_rate = 0
    else:
        improvement_rate = 0

    # 最近推演记录
    recent_records = [
        {
            "id": r.id, "behavior": r.behavior, "risk_score": r.risk_score,
            "level": r.level, "scene_type": r.scene_type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in scoped_records[: (3 if is_mobile else 5)]
    ]

    # 提升建议
    suggestions = []
    for w in weaknesses:
        suggestions.append(f"重点加强「{w.get('scene_type')}」训练，当前平均风险分 {w.get('avg_score', 0)}，需反复推演规避高风险操作。")
    for h in high_freq[:2]:
        suggestions.append(f"高频易错项「{h.get('behavior', '')[:24]}」已出现 {h.get('count', 0)} 次，建议针对性复习纠错步骤。")
    if not suggestions:
        suggestions.append("暂无薄弱点数据，多进行场景推演以生成个性化提升建议。")

    data = {
        "pass_rate": pass_rate,
        "total_records": len(scoped_records),
        "avoided_count": avoided,
        "risk_distribution": dist,
        "high_freq_errors": high_freq,
        "weaknesses": weaknesses,
        "trend": trend,
        "improvement_rate": improvement_rate,
        "recent_records": recent_records,
        "suggestions": suggestions[:5],
        "scene_type": scene_type or "all",
        "scene_code": scene_code or "",
    }
    return ok(data)


@router.get("/certificate")
def certificate(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """学时记录 + 达标等级 + 证书信息。"""
    from app.models.training import TrainingRecord
    from app.models.quiz_record import QuizRecord as QR
    from app.models.scene import Scene
    from sqlalchemy import func

    # 培训记录
    trainings = (
        db.query(TrainingRecord)
        .filter(TrainingRecord.user_id == user.id)
        .all()
    )
    # 学时：每次模拟练习计 0.5 学时，每次通过考核计 2 学时
    total_hours = 0.0
    passed_scenes = []
    for tr in trainings:
        total_hours += (tr.sim_count or 0) * 0.5
        if tr.pass_ and tr.post_at:
            total_hours += 2.0
            passed_scenes.append(tr.scene_code)

    # 考试记录
    quizzes = db.query(QR).filter(QR.user_id == user.id).all()
    avg_quiz = round(sum(q.score for q in quizzes) / len(quizzes), 1) if quizzes else 0

    # 推演记录
    op_records = db.query(OperationRecord).filter(OperationRecord.user_id == user.id).all()
    total_inferences = len(op_records)

    # 达标等级
    scene_count = db.query(func.count(Scene.id)).scalar() or 1
    pass_ratio = len(passed_scenes) / scene_count
    if total_hours >= 16 and avg_quiz >= 85 and pass_ratio >= 0.8:
        level = "优秀"
        level_color = "#e74c3c"
    elif total_hours >= 8 and avg_quiz >= 70 and pass_ratio >= 0.5:
        level = "良好"
        level_color = "#e67e22"
    elif total_hours >= 4 and avg_quiz >= 60:
        level = "合格"
        level_color = "#27ae60"
    else:
        level = "未达标"
        level_color = "#95a5a6"

    # 证书编号
    cert_no = f"AI-AVOID-{user.id:04d}-{int(total_hours):03d}"

    data = {
        "cert_no": cert_no,
        "user_name": user.display_name or user.username,
        "department": user.department or "",
        "level": level,
        "level_color": level_color,
        "total_hours": round(total_hours, 1),
        "total_inferences": total_inferences,
        "total_quizzes": len(quizzes),
        "avg_quiz_score": avg_quiz,
        "passed_scenes": passed_scenes,
        "passed_count": len(passed_scenes),
        "total_scenes": scene_count,
        "issue_date": __import__("datetime").datetime.now().strftime("%Y-%m-%d"),
    }
    return ok(data)
