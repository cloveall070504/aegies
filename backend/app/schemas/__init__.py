"""Pydantic 请求/响应模型。"""
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


class ScenarioInferRequest(BaseModel):
    behavior: str
    scene_type: str = "experiment"  # experiment / workshop / general
