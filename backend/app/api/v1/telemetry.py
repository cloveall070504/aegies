"""遥测查看 / 快照上报接口（/api/v1/telemetry）。

前端每 20s 把本地累计的成功/失败/耗时快照 POST 过来；
运维或答辩演示可通过 GET /api/v1/telemetry/stats 实时查看三类通道成功率。
"""

from fastapi import APIRouter, Request

from app.services import telemetry as tm

router = APIRouter(prefix="/telemetry", tags=["遥测"])


@router.get("/stats")
def get_stats():
    """返回 TTS / ASR / LLM 三类通道的成功率与累计耗时。"""
    return tm.stats()


@router.post("/snapshot")
async def post_snapshot(req: Request):
    """接收前端周期性上报的本地累计快照并合并。"""
    try:
        body = await req.json()
    except Exception:  # noqa: BLE001
        body = {}
    tm.ingest_snapshot((body or {}).get("channels", {}))
    return {"ok": True}
