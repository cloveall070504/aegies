"""认证接口：登录/注册/当前用户/用户管理（admin）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models.user import User
from app.schemas import (
    LoginRequest,
    RegisterRequest,
    UserCreateRequest,
    UserUpdateRequest,
)
from app.utils.response import fail, ok

router = APIRouter(prefix="/auth", tags=["认证"])

# 允许分配的角色白名单
ROLE_CHOICES = {"student", "teacher", "admin"}


def _role_invalid(role: str) -> bool:
    return role not in ROLE_CHOICES


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
        role="student",  # 自注册强制为学生，管理员角色只能由后台分配
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


# ===================== 用户管理（仅 admin） =====================

@router.get("/users")
def list_users(
    role: str = "",
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
    _admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """管理员查看用户列表（按角色/关键字过滤、分页）。"""
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter(User.username.ilike(like) | User.display_name.ilike(like))
    total = q.count()
    rows = (
        q.order_by(User.id)
        .offset((max(page, 1) - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return ok({
        "items": [u.to_dict() for u in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@router.post("/users")
def create_user(
    req: UserCreateRequest,
    _admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """管理员创建用户，可指定角色（student/teacher/admin）。"""
    if _role_invalid(req.role):
        return fail("角色非法，仅允许 student/teacher/admin", code=400)
    if not req.username or not req.password:
        return fail("用户名与密码必填", code=400)
    if len(req.password) < 6:
        return fail("密码至少 6 位", code=400)
    if db.query(User).filter(User.username == req.username).first():
        return fail("用户名已存在", code=409)
    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
        role=req.role,
        department=req.department,
        phone=req.phone,
        display_name=req.display_name,
        is_active=req.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return ok(user.to_dict(), message="创建成功")


@router.put("/users/{uid}")
def update_user(
    uid: int,
    req: UserUpdateRequest,
    _admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """管理员更新用户：角色 / 密码 / 部门 / 姓名 / 启用停用。"""
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        return fail("用户不存在", code=404)
    if req.role is not None:
        if _role_invalid(req.role):
            return fail("角色非法，仅允许 student/teacher/admin", code=400)
        user.role = req.role
    if req.password is not None:
        if len(req.password) < 6:
            return fail("密码至少 6 位", code=400)
        user.password_hash = hash_password(req.password)
    if req.department is not None:
        user.department = req.department
    if req.display_name is not None:
        user.display_name = req.display_name
    if req.is_active is not None:
        user.is_active = req.is_active
    db.commit()
    db.refresh(user)
    return ok(user.to_dict(), message="更新成功")


@router.delete("/users/{uid}")
def delete_user(
    uid: int,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """管理员删除用户（不能删自己，不能删最后一个管理员）。"""
    if uid == admin.id:
        return fail("不能删除当前登录的自己", code=400)
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        return fail("用户不存在", code=404)
    if user.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            return fail("不能删除最后一个管理员", code=400)
    db.delete(user)
    db.commit()
    return ok(message="删除成功")
