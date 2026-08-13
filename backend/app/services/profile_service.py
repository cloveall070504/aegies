"""个人画像服务：聚合用户记录，计算高频错误、薄弱点、达标率。"""
import json
from collections import Counter

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.operation_record import OperationRecord
from app.models.personal_profile import PersonalProfile
from app.models.quiz_record import QuizRecord


def get_or_build_profile(db: Session, user_id: int) -> PersonalProfile:
    profile = db.query(PersonalProfile).filter(PersonalProfile.user_id == user_id).first()
    if profile is None:
        profile = PersonalProfile(user_id=user_id)
        db.add(profile)
        db.flush()
    return profile


def refresh_profile(db: Session, user_id: int) -> PersonalProfile:
    records = db.query(OperationRecord).filter(OperationRecord.user_id == user_id).all()
    quizzes = db.query(QuizRecord).filter(QuizRecord.user_id == user_id).all()

    total = len(records) + len(quizzes)
    avoided = sum(1 for r in records if r.risk_score < 40)
    avg_score = (sum(r.risk_score for r in records) / len(records)) if records else 0
    pass_rate = (sum(q.score for q in quizzes) / len(quizzes)) if quizzes else 0

    # 高频错误：按行为聚合
    behavior_counter = Counter(r.behavior[:30] for r in records)
    high_freq = [{"behavior": b, "count": c} for b, c in behavior_counter.most_common(5)]

    # 薄弱点：按场景聚合高分记录
    scene_scores = {}
    for r in records:
        scene_scores.setdefault(r.scene_type, []).append(r.risk_score)
    weaknesses = [
        {"scene_type": scene, "avg_score": round(sum(s) / len(s), 1)}
        for scene, s in scene_scores.items() if s and sum(s) / len(s) >= 40
    ][:5]

    profile = get_or_build_profile(db, user_id)
    profile.high_freq_errors = json.dumps(high_freq, ensure_ascii=False)
    profile.weaknesses = json.dumps(weaknesses, ensure_ascii=False)
    profile.pass_rate = round(pass_rate, 1)
    profile.total_records = total
    profile.avoided_count = avoided
    profile.avg_risk_score = round(avg_score, 1)
    db.commit()
    db.refresh(profile)
    return profile
