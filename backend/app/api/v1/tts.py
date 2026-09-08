"""神经语音 TTS 端点：基于 edge-tts（微软 Edge 在线神经语音，免费）

演进说明（2026-09 调优"开口慢/音色跳"）：
- 旧实现：每次请求 fork 一个新 python 子进程跑 _tts_worker.py。
  实测单次固定开销 ~4-5s（python 启动 + edge-tts 握手），且 edge 免费接口
  首次连接不稳、偶发 503 → 前端整段降级浏览器语音 → 音色时好时坏。
- 新实现：edge-tts 7.x 是纯 asyncio 客户端，直接在 uvicorn 进程内 async 合成：
  * 进程常驻，连接复用 → 后续请求 ~1.5-2.5s（不再是每次 ~5s）；
  * 启动预热一次 + 串行锁 + 一次重试 → 大幅降低 503 概率；
  * 保持鉴权 + 文本长度上限，防滥用。
"""
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

# edge-tts 免费接口对并发很敏感：同一时刻多个连接容易互相挤掉线（表现为 503 / Cannot connect）。
# 数字人是单用户场景 → 用进程内 asyncio 锁把合成串行化，换取稳定。
_tts_lock = asyncio.Lock()

# 单次合成超时（秒）：edge-tts 直连 100 字约 1.5-2.5s，留足余量。
_TTS_TIMEOUT = 25.0

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


async def _synth_once(text: str, voice: str, rate: str, pitch: str, volume: str) -> bytes:
    """同进程调用 edge-tts 合成，返回 MP3 字节。失败抛异常。"""
    import edge_tts

    comm = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch, volume=volume)
    buf = bytearray()
    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            buf.extend(chunk["data"])
    if not buf:
        raise RuntimeError("edge-tts returned empty audio")
    return bytes(buf)


_warmup_started = False


async def _ensure_warmup():
    """懒预热：首次 /speak 调用时触发一次，成功后不再重复。"""
    global _warmup_started
    if _warmup_started:
        return
    _warmup_started = True
    try:
        await asyncio.wait_for(
            _synth_once("你好，我是实验安全向导。", DEFAULT_VOICE, "+0%", "+0Hz", "+0%"),
            timeout=15.0,
        )
        logger.info("TTS warmup done")
    except Exception as e:
        logger.warning(f"TTS warmup failed (will retry on next request): {e}")
        _warmup_started = False  # 失败允许下次再预热


@router.post("/speak")
async def speak(req: TTSRequest, _user: User = Depends(get_current_user)):
    """生成神经语音 MP3 音频流。

    同进程常驻合成：快（复用连接）+ 稳（锁+预热+重试）。
    仍需鉴权：任何人可打满合成请求，必须鉴权 + 长度上限。
    """
    vp = EXPR_VOICE.get(req.expression or "neutral", EXPR_VOICE["neutral"])

    voice = req.voice or DEFAULT_VOICE
    rate = req.rate or vp["rate"]
    pitch = req.pitch or vp["pitch"]
    volume = req.volume or vp["volume"]

    logger.info(f"TTS: {len(req.text)} chars, {voice}, rate={rate}")

    if len(req.text) > 2000:
        err_body = json.dumps({
            "code": 400,
            "message": "文本过长（上限 2000 字），请分段生成。",
            "data": None,
        }, ensure_ascii=False).encode("utf-8")
        return Response(status_code=400, content=err_body, media_type="application/json")

    # 懒预热：首次调用先打通一次连接，减少后面第一句的握手等待
    await _ensure_warmup()

    # 串行合成 + 一次性重试：边缘网络瞬时失败会立刻重来，避免前端整段降级成浏览器语音
    async with _tts_lock:
        for attempt in (1, 2):
            try:
                data = await asyncio.wait_for(
                    _synth_once(req.text, voice, rate, pitch, volume),
                    timeout=_TTS_TIMEOUT,
                )
                break
            except asyncio.TimeoutError:
                logger.error(f"TTS timeout ({_TTS_TIMEOUT}s), attempt {attempt}")
                if attempt == 1:
                    continue
                err_body = json.dumps({
                    "code": 504,
                    "message": "TTS 生成超时，前端将自动降级为浏览器语音。",
                    "data": None,
                }, ensure_ascii=False).encode("utf-8")
                return Response(status_code=504, content=err_body, media_type="application/json")
            except Exception as e:
                logger.warning(f"TTS synth failed, attempt {attempt}: {type(e).__name__} {str(e)[:150]}")
                if attempt == 1:
                    await asyncio.sleep(0.4)  # 网络瞬时抖动，稍等重试
                    continue
                err_body = json.dumps({
                    "code": 503,
                    "message": "TTS 服务暂不可用（edge-tts 连接失败），前端将自动降级为浏览器语音。",
                    "data": None,
                }, ensure_ascii=False).encode("utf-8")
                return Response(status_code=503, content=err_body, media_type="application/json")
        else:
            data = b""

    logger.info(f"TTS done: {len(data)} bytes")

    return Response(
        content=data,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache"},
    )
