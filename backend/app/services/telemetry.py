"""轻量级遥测聚合（进程内存）。

记录 TTS / ASR / LLM 三类调用的成功次数、失败次数与累计耗时，
用于实时观察各通道成功率。生产应替换为 Redis / 时序库，此处为单机 demo 级实现。
"""

from datetime import datetime, timezone
from typing import Dict, Any

_CHANNELS = ("tts", "asr", "llm")
_stats: Dict[str, Dict[str, int]] = {c: {"ok": 0, "fail": 0, "total_ms": 0} for c in _CHANNELS}
_updated_at: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def record(channel: str, ok: bool, ms: int = 0) -> None:
    """单条调用结果上报（后端通道或前端单条事件）。"""
    if channel not in _stats:
        return
    bucket = _stats[channel]
    bucket["ok" if ok else "fail"] += 1
    bucket["total_ms"] += int(ms or 0)
    global _updated_at
    _updated_at = _now()


def ingest_snapshot(channels: Dict[str, Any]) -> None:
    """合并前端周期性上报的本地累计快照（前端已累加，这里再累加）。"""
    if not isinstance(channels, dict):
        return
    for ch, vals in channels.items():
        if ch not in _stats or not isinstance(vals, dict):
            continue
        _stats[ch]["ok"] += int(vals.get("ok", 0) or 0)
        _stats[ch]["fail"] += int(vals.get("fail", 0) or 0)
        _stats[ch]["total_ms"] += int(vals.get("total_ms", 0) or 0)
    global _updated_at
    _updated_at = _now()


def stats() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for ch, v in _stats.items():
        total = v["ok"] + v["fail"]
        out[ch] = {
            "ok": v["ok"],
            "fail": v["fail"],
            "total": total,
            "total_ms": v["total_ms"],
            "success_rate": round(v["ok"] / total, 4) if total else None,
        }
    return {"channels": out, "updated_at": _updated_at}
