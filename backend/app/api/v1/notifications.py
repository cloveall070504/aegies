"""消息中心接口：站内通知列表、标记已读。

- GET  /notifications          消息列表（含未读计数；只读，不生成提醒）
- POST /notifications/{id}/read 标记单条已读
- POST /notifications/read-all  全部已读

复习提醒由 quiz/submit 在答错时创建，避免列表接口反复生成重复提醒。
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.learning import Notification
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/notifications", tags=["消息中心"])


@router.get("")
def list_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 注意：复习提醒不在「读取列表」时生成，避免每次刷新都新建重复提醒。
    # 提醒统一在 quiz/submit 答错时创建（见 app/api/v1/quiz.py）。
    items = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        .count()
    )
    return ok({"unread_count": unread, "items": [n.to_dict() for n in items]})


@router.post("/{nid}/read")
def mark_read(
    nid: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = (
        db.query(Notification)
        .filter(Notification.id == nid, Notification.user_id == user.id)
        .first()
    )
    if not n:
        return fail("消息不存在", code=404)
    n.is_read = True
    db.commit()
    return ok({"id": nid, "is_read": True})


@router.post("/read-all")
def mark_all(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.is_read == False  # noqa: E712
    ).update({"is_read": True})
    db.commit()
    return ok({"done": True})
