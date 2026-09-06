"""神经语音 TTS 端点：基于 edge-tts（微软 Edge 在线神经语音，免费）
使用子进程方式调用，避免与 uvicorn 的 aiohttp 事件循环冲突。
"""
import sys
import os
import json
import asyncio
import logging

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tts", tags=["TTS"])

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"

# 子进程超时（秒）：edge-tts 正常生成 100 字约 2-3 秒，
# 留足余量设 30 秒，防止网络卡死导致子进程泄漏。
_TTS_TIMEOUT = 30.0

EXPR_VOICE = {
    "neutral":  {"rate": "+30%", "pitch": "+0Hz",  "volume": "+0%"},
    "calm":     {"rate": "+18%", "pitch": "-3Hz",  "volume": "-5%"},
    "happy":    {"rate": "+45%", "pitch": "+8Hz",  "volume": "+5%"},
    "alert":    {"rate": "+50%", "pitch": "+5Hz",  "volume": "+10%"},
    "thinking": {"rate": "+10%", "pitch": "-8Hz",  "volume": "-5%"},
    "focus":    {"rate": "+18%", "pitch": "-4Hz",  "volume": "+0%"},
    "approve":  {"rate": "+35%", "pitch": "+5Hz",  "volume": "+5%"},
    "surprised":{"rate": "+55%", "pitch": "+15Hz", "volume": "+10%"},
    "worried":  {"rate": "+15%", "pitch": "-6Hz",  "volume": "-8%"},
}


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    rate: str | None = None
    pitch: str | None = None
    volume: str | None = None
    expression: str | None = None


# edge-tts 子进程脚本
_WORKER_SCRIPT = os.path.join(os.path.dirname(__file__), "_tts_worker.py")


@router.post("/speak")
async def speak(req: TTSRequest, _user: User = Depends(get_current_user)):
    """生成神经语音 MP3 音频流。

    需登录：本接口每次请求会 fork 一个 edge-tts 子进程（约 4~7s），
    不鉴权的话任何人都能打满进程池，因此必须鉴权 + 单独限流。
    """
    vp = EXPR_VOICE.get(req.expression or "neutral", EXPR_VOICE["neutral"])

    voice = req.voice or DEFAULT_VOICE
    rate = req.rate or vp["rate"]
    pitch = req.pitch or vp["pitch"]
    volume = req.volume or vp["volume"]

    logger.info(f"TTS: {len(req.text)} chars, {voice}, rate={rate}")

    # 通过子进程调用 edge-tts，避免与 uvicorn 的 aiohttp 事件循环冲突
    proc = await asyncio.create_subprocess_exec(
        sys.executable, _WORKER_SCRIPT,
        req.text, voice, rate, pitch, volume,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=_TTS_TIMEOUT
        )
    except asyncio.TimeoutError:
        # 超时 → 强制杀掉子进程，防止泄漏
        logger.error(f"TTS worker timeout ({_TTS_TIMEOUT}s), killing process")
        try:
            proc.kill()
            await proc.wait()
        except Exception:
            pass
        return Response(status_code=504, content="TTS timeout")

    if proc.returncode != 0 or not stdout:
        err_text = stderr.decode("utf-8", errors="replace")[:500]
        logger.warning(f"TTS worker failed: rc={proc.returncode}\n{err_text}")
        # 503 服务不可用：前端可识别并降级到浏览器 Web Speech API
        # 用 JSON 格式返回，方便前端解析
        err_body = json.dumps({
            "code": 503,
            "message": "TTS 服务暂不可用（edge-tts 连接失败），前端将自动降级为浏览器语音。",
            "data": None,
        }, ensure_ascii=False).encode("utf-8")
        return Response(status_code=503, content=err_body, media_type="application/json")

    logger.info(f"TTS done: {len(stdout)} bytes")

    return Response(
        content=stdout,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache"},
    )
