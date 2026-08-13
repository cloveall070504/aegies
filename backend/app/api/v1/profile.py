"""个人画像接口。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_client_type, get_current_user
from app.database import get_db
from app.models.user import User
from app.services.profile_service import refresh_profile
from app.utils.response import ok

router = APIRouter(prefix="/profile", tags=["个人画像"])


@router.get("/personal")
def personal(
    client_type: str = Depends(get_client_type),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = refresh_profile(db, user.id)
    return ok(profile.to_dict(brief=(client_type == "mobile")))
