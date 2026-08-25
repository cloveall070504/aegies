"""学习中心接口：个性化弱项推荐 + 闯关式学习路径 + 错题间隔重复复习。

- GET  /learning/overview      学员个性化总览：本周推荐练习(弱项Top3) + 闯关路径
- GET  /learning/review/due    当前待复习的错题列表（间隔重复到期）
- POST /learning/review/complete 标记某错题已复习，推后下次复习间隔
"""
import json
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.learning import ReviewItem
from app.models.quiz_record import QuizRecord
from app.models.risk_point import RiskPoint
from app.models.scene import Scene
from app.models.training import TrainingRecord
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/learning", tags=["学习中心"])


def _now():
    return datetime.utcnow()


# 简单内存缓存：避免每次进入学习路径页都全表重算弱项/路径聚合
_OVERVIEW_CACHE_TTL = 60  # 秒
_overview_cache = {}


def _overview_cache_get(user_id):
    entry = _overview_cache.get(user_id)
    if entry and (time.time() - entry[1]) < _OVERVIEW_CACHE_TTL:
        return entry[0]
    return None


def _overview_cache_set(user_id, payload):
    _overview_cache[user_id] = (payload, time.time())


def _iso(dt):
    """序列化 datetime 为带 UTC 时区的 ISO 字符串，避免前端按本地时区解析导致时间偏差。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _scene_name(scenes, sc):
    s = scenes.get(sc)
    return s.name if s else (sc or "通用")


@router.get("/overview")
def learning_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """个性化弱项推荐 + 闯关式学习路径。

    推荐逻辑：汇总学员历史错题，按场景关联到风险点，错题越多的风险点优先推荐；
    若无错题记录，则回退为组织高频风险点（high/medium）。
    路径逻辑：以学员「参与过的场景」为关卡，按掌握度升序排列，最弱的为当前关卡。
    """
    # 缓存：60s 内同一用户直接返回，避免重复全表聚合
    cached = _overview_cache_get(user.id)
    if cached is not None:
        return ok(cached)
    # 1. 汇总错题（按场景）
    records = (
        db.query(QuizRecord)
        .filter(QuizRecord.user_id == user.id)
        .order_by(QuizRecord.id.desc())
        .limit(50)
        .all()
    )
    scene_wrong: dict[str, dict] = {}
    for r in records:
        sc = r.scene_code or ""
        try:
            items = json.loads(r.wrong_items) if r.wrong_items else []
        except Exception:
            items = []
        d = scene_wrong.setdefault(sc, {"wrong_total": 0, "questions": {}})
        for it in items:
            d["wrong_total"] += 1
            qid = str(it.get("id", ""))
            d["questions"][qid] = d["questions"].get(qid, 0) + 1

    # 2. 风险点（仅已审核通过的）
    risk_points = db.query(RiskPoint).filter(RiskPoint.reviewed == 1).all()
    rp_by_scene: dict[str, list] = {}
    for rp in risk_points:
        rp_by_scene.setdefault(rp.scene_id or "", []).append(rp)

    # 3. 场景名映射
    scenes = {s.scene_code: s for s in db.query(Scene).all()}
    sname = lambda sc: _scene_name(scenes, sc)

    # 4. 推荐：把错题场景关联到风险点，错题数高者优先
    level_rank = {"high": 0, "medium": 1, "low": 2}
    scored = []
    for sc, d in scene_wrong.items():
        if not d["wrong_total"]:
            continue
        for rp in rp_by_scene.get(sc, []):
            scored.append(
                (d["wrong_total"], rp, sc, f"你在「{sname(sc)}」累计错题 {d['wrong_total']} 次")
            )
    scored.sort(key=lambda x: (-x[0], level_rank.get(x[1].level, 1)))
    recommended = [
        {
            "risk_point_id": rp.id,
            "description": rp.description,
            "level": rp.level,
            "scene_code": sc,
            "scene_name": sname(sc),
            "reason": reason,
        }
        for _, rp, sc, reason in scored[:3]
    ]

    # 兜底：无错题时取组织高频风险点
    if not recommended:
        fb = [rp for rp in risk_points if rp.level in ("high", "medium")]
        fb.sort(key=lambda r: level_rank.get(r.level, 1))
        recommended = [
            {
                "risk_point_id": rp.id,
                "description": rp.description,
                "level": rp.level,
                "scene_code": rp.scene_id or "",
                "scene_name": sname(rp.scene_id or ""),
                "reason": "组织高频风险点，建议优先掌握",
            }
            for rp in fb[:3]
        ]

    # 5. 闯关路径：以参与过的场景为关卡
    engaged = set(scene_wrong.keys())
    for (sc,) in db.query(TrainingRecord.scene_code).filter(TrainingRecord.user_id == user.id).distinct().all():
        engaged.add(sc or "")

    path = []
    mastered_cnt = 0
    for sc in engaged:
        if sc == "":
            continue
        trs = (
            db.query(TrainingRecord)
            .filter(TrainingRecord.user_id == user.id, TrainingRecord.scene_code == sc)
            .all()
        )
        passed = any((t.pass_ or 0) == 1 for t in trs)
        wrong = scene_wrong.get(sc, {}).get("wrong_total", 0)
        if passed:
            mastery = 92
        elif wrong == 0:
            mastery = 78
        else:
            mastery = max(20, 100 - wrong * 15)
        rps = [
            {"id": rp.id, "description": rp.description, "level": rp.level}
            for rp in rp_by_scene.get(sc, [])
        ]
        path.append(
            {
                "scene_code": sc,
                "scene_name": sname(sc),
                "mastery": mastery,
                "risk_points": rps,
            }
        )

    # 掌握度升序（最弱在前），分配关卡状态
    path.sort(key=lambda x: x["mastery"])
    assigned_current = False
    for lv in path:
        if lv["mastery"] >= 70:
            lv["status"] = "mastered"
            mastered_cnt += 1
        elif not assigned_current:
            lv["status"] = "current"
            assigned_current = True
        else:
            lv["status"] = "locked"

    stats = {
        "total_weak": len(recommended),
        "path_progress": f"{mastered_cnt}/{len(path)} 已掌握" if path else "尚无学习记录",
        "engaged_scenes": len(path),
    }
    payload = {"recommended": recommended, "path": path, "stats": stats}
    _overview_cache_set(user.id, payload)
    return ok(payload)


@router.get("/review/due")
def review_due(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """当前到期（可复习）的错题列表。"""
    now = _now()
    items = (
        db.query(ReviewItem)
        .filter(
            ReviewItem.user_id == user.id,
            (ReviewItem.next_review_at == None) | (ReviewItem.next_review_at <= now),
        )
        .order_by(ReviewItem.next_review_at.asc())
        .all()
    )
    return ok({"count": len(items), "items": [i.to_dict() for i in items]})


class ReviewComplete(BaseModel):
    item_id: str
    scene_code: str = ""


@router.post("/review/complete")
def review_complete(
    req: ReviewComplete,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """标记某错题已复习：按间隔重复推后下次复习时间。"""
    now = _now()
    item = (
        db.query(ReviewItem)
        .filter(
            ReviewItem.user_id == user.id,
            ReviewItem.item_id == req.item_id,
            ReviewItem.scene_code == req.scene_code,
        )
        .first()
    )
    if not item:
        return fail("未找到该复习项", code=404)

    item.repetitions = (item.repetitions or 0) + 1
    if item.repetitions == 1:
        item.interval_days = 1
    else:
        item.interval_days = min(60, max(1, round((item.interval_days or 1) * (item.ease or 2.5))))
    item.ease = round(min(3.0, max(1.3, (item.ease or 2.5) + 0.05)), 2)
    item.last_reviewed_at = now
    item.next_review_at = now + timedelta(days=item.interval_days)
    db.commit()
    return ok(
        {
            "item_id": item.item_id,
            "interval_days": item.interval_days,
            "next_review_at": _iso(item.next_review_at),
            "repetitions": item.repetitions,
        }
    )
