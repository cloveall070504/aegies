"""自测接口：题库、提交判分、错题解析。"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.quiz_record import QuizRecord
from app.models.user import User
from app.services.profile_service import refresh_profile
from app.utils.response import fail, ok

router = APIRouter(prefix="/quiz", tags=["自测"])

# 内置题库（可被文档抽取扩充）
QUIZ_BANK = [
    {"id": "q1", "question": "加热试管时，试管口应朝向哪个方向？",
     "options": ["朝向自己", "朝向他人", "朝向无人区", "任意方向"], "answer": 2,
     "analysis": "试管口朝向人会导致液体喷溅伤人，应朝向无人区。"},
    {"id": "q2", "question": "实验结束后，酒精灯应如何处理？",
     "options": ["直接离开", "用嘴吹灭", "盖灭后确认火已熄", "泼水浇灭"], "answer": 2,
     "analysis": "应用灯帽盖灭酒精灯，并确认火焰完全熄灭后离开。"},
    {"id": "q3", "question": "酸性废液应如何处理？",
     "options": ["直接倒入下水道", "中和后分类收集", "倒入垃圾桶", "倒回原试剂瓶"], "answer": 1,
     "analysis": "酸性废液必须中和后分类收集，严禁直排下水道。"},
    {"id": "q4", "question": "带电作业时以下哪项做法正确？",
     "options": ["带电接线", "先断电再操作", "用湿手操作开关", "随意更换元器件"], "answer": 1,
     "analysis": "电气作业必须先断电、验电后再操作，严禁带电作业。"},
    {"id": "q5", "question": "进入吊装作业区必须佩戴什么？",
     "options": ["普通帽子", "安全帽并系好帽带", "口罩", "无需佩戴"], "answer": 1,
     "analysis": "进入吊装作业区必须佩戴安全帽并系好帽带，防止高空坠物。"},
]


class QuizSubmit(BaseModel):
    quiz_id: str = "quiz_001"
    answers: list[int]


@router.get("/questions")
def questions(user: User = Depends(get_current_user)):
    return ok({"quiz_id": "quiz_001", "questions": QUIZ_BANK})


@router.post("/submit")
def submit(req: QuizSubmit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(req.answers) != len(QUIZ_BANK):
        return fail("答案数量与题目数量不匹配", code=400)
    correct = 0
    wrong_items = []
    for q, ans in zip(QUIZ_BANK, req.answers):
        if ans == q["answer"]:
            correct += 1
        else:
            wrong_items.append({
                "id": q["id"],
                "question": q["question"],
                "your_answer": q["options"][ans] if 0 <= ans < len(q["options"]) else "未作答",
                "correct_answer": q["options"][q["answer"]],
                "analysis": q["analysis"],
            })
    total = len(QUIZ_BANK)
    score = round(correct / total * 100)

    record = QuizRecord(
        user_id=user.id,
        quiz_id=req.quiz_id,
        score=score,
        total=total,
        correct=correct,
        wrong_items=json.dumps(wrong_items, ensure_ascii=False),
    )
    db.add(record)
    db.commit()
    refresh_profile(db, user.id)
    return ok({
        "record_id": record.id,
        "score": score,
        "total": total,
        "correct": correct,
        "wrong_items": wrong_items,
    }, message="提交成功")


@router.get("/records")
def records(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(QuizRecord).filter(QuizRecord.user_id == user.id).order_by(QuizRecord.id.desc()).limit(20).all()
    return ok([r.to_dict() for r in items])
