"""FastAPI 依赖：鉴权、客户端类型、当前用户。"""
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_client_type(x_client_type: str | None = Header(default=None)) -> str:
    """从 X-Client-Type 请求头读取终端类型，默认 pc。"""
    return x_client_type if x_client_type in ("pc", "mobile") else "pc"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证令牌")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="令牌无效或已过期")
    user_id = int(payload.get("sub", 0))
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user


def require_roles(*roles: str):
    """角色权限控制依赖工厂。"""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限访问")
        return user

    return checker
