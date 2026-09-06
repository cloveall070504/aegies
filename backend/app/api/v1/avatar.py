"""数字人（LiveTalking 渲染服务）编排接口 —— 学生端数字人主页使用。

设计原则：
  * 数字人只是"嘴和脸"，台词内容一律由规则引擎产出，本模块不做任何内容生成，
    避免出现"数字人自己在编安全结论"的不可审计问题；
  * LiveTalking 未部署时接口照常返回 available=False，前端回落到光形占位，
    不影响其它功能——避免"一个渲染服务没起就整页不可用"。
"""
import os
import time

import httpx
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.utils.response import ok

router = APIRouter(prefix="/avatar", tags=["数字人"])

# 渲染服务地址（默认 LiveTalking 的 WebRTC 服务端口）
LIVETALKING_URL = os.getenv("LIVETALKING_URL", "http://127.0.0.1:8010").rstrip("/")

# 探测结果缓存（秒）：避免前端反复调用时频繁发起网络探测
_STATUS_TTL = 5.0
_cache = {"at": 0.0, "alive": False}


def _probe() -> bool:
    """探测 LiveTalking 是否在线（带短 TTL 缓存）。"""
    now = time.time()
    if now - _cache["at"] < _STATUS_TTL:
        return _cache["alive"]
    alive = False
    try:
        r = httpx.get(f"{LIVETALKING_URL}/", timeout=1.5)
        alive = r.status_code < 500
    except Exception:  # noqa: BLE001 —— 服务未启动属预期情况，静默降级
        alive = False
    _cache.update(at=now, alive=alive)
    return alive


@router.get("/status")
def avatar_status(_user: User = Depends(get_current_user)):
    """数字人渲染服务状态；不可用时前端显示光形占位。"""
    alive = _probe()
    return ok(
        {
            "available": alive,
            "url": LIVETALKING_URL,
            "mode": "livetalking" if alive else "placeholder",
        }
    )


@router.post("/talk")
def avatar_talk(payload: dict, _user: User = Depends(get_current_user)):
    """把一句台词交给数字人念出（转发到 LiveTalking /human）。

    不可用时返回 delivered=False，前端仅显示字幕，不报错、不打断使用。
    """
    text = ((payload or {}).get("text") or "").strip()
    if not text:
        return ok({"delivered": False, "reason": "empty_text", "text": ""})
    if not _probe():
        return ok({"delivered": False, "reason": "livetalking_unavailable", "text": text})
    try:
        r = httpx.post(
            f"{LIVETALKING_URL}/human",
            # interrupt=True：新台词打断上一句，避免排队念旧内容
            json={"text": text, "type": "echo", "sessionid": 0, "interrupt": True},
            timeout=8.0,
        )
        return ok({"delivered": r.status_code < 400, "text": text})
    except Exception as exc:  # noqa: BLE001
        return ok({"delivered": False, "reason": str(exc), "text": text})
