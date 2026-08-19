"""Pydantic 请求/响应模型。"""
from typing import Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "student"
    department: str = ""
    phone: str = ""
    display_name: str = ""


class UserCreateRequest(BaseModel):
    """管理员后台创建用户（可指定角色）。"""
    username: str
    password: str
    role: str = "student"
    department: str = ""
    phone: str = ""
    display_name: str = ""
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    """管理员后台更新用户（字段均可选）。"""
    role: Optional[str] = None
    password: Optional[str] = None
    department: Optional[str] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class ScenarioInferRequest(BaseModel):
    behavior: str
    scene_type: str = "experiment"  # experiment / workshop / general
    scene_code: str = ""            # 具体场景代码（chem_lab 等）
