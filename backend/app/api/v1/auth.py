"""认证接口：登录/注册/当前用户。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models.user import User
from app.schemas import LoginRequest, RegisterRequest
from app.utils.response import fail, ok

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        return fail("用户名或密码错误", code=401)
    token = create_access_token(user.id, user.role)
    return ok({"token": token, "user": user.to_dict()})


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == req.username).first():
        return fail("用户名已存在", code=409)
    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        role=req.role,
        department=req.department,
        phone=req.phone,
        display_name=req.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    return ok({"token": token, "user": user.to_dict()}, message="注册成功")


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return ok(user.to_dict())
