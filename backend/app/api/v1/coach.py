"""数字人教练能力路由：12 项功能的 HTTP 入口。

所有"安全结论"都经 AgentService(db).infer(...)（规则引擎唯一事实源）算出后，
交给 coach_service 做教练编排；本路由层只做：鉴权 + 调规则引擎 + 转发。
"""
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.agent_service import AgentService
from app.services import coach_service as coach
from app.utils.response import ok


router = APIRouter(prefix="/companion/coach", tags=["数字人教练"])


# ---------------- 请求体 ----------------
class SocraticReq(BaseModel):
    operation_text: str
    student_answer: str = ""


class HintsReq(BaseModel):
    text: str
    level: int = 0  # 0=全部三级；1~3=指定级


class AttributeReq(BaseModel):
    operation_text: str
    student_answer: str = ""


class StateReq(BaseModel):
    speed: float = 2.0       # 1=慢 2=中 3=快
    accuracy: float = 0.8    # 0~1
    confusion_rate: float = 0.1  # 0~1


class EmotionReq(BaseModel):
    text: str = ""
    signals: dict = {}


class PrefsReq(BaseModel):
    prefs: dict = {}


class VisionReq(BaseModel):
    frame_description: str = ""
    question: str = ""


class RecordErrorReq(BaseModel):
    text: str
    level: str = "medium"
    error_type: str = ""
    topic: str = ""


class InterruptReq(BaseModel):
    session_id: str = "default"


# ---------------- 项1：追问引导 ----------------
@router.post("/socratic")
async def coach_socratic(payload: SocraticReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = await AgentService(db).infer(payload.operation_text, "experiment")
    out = coach.socratic_next(payload.operation_text, payload.student_answer, result["level"], result.get("correction", ""))
    return ok(out)


# ---------------- 项2：渐进式提示 ----------------
@router.post("/hints")
def coach_hints(payload: HintsReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(coach.progressive_hints(payload.text, payload.level))


# ---------------- 项3：错因归因 + 个性化补救（并写入长期记忆） ----------------
@router.post("/attribute")
async def coach_attribute(payload: AttributeReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = await AgentService(db).infer(payload.operation_text, "experiment")
    attr = coach.attribute_error(payload.operation_text, payload.student_answer, result["level"])
    # 写回长期记忆（跨场景共享）
    coach.record_error(db, user.id, payload.operation_text, result["level"], attr["error_type"], attr["topic"])
    return ok({**attr, "level": result["level"]})


# 单独的错误记录入口（供避错沙盘/扫描失败案例回流）
@router.post("/record-error")
def coach_record_error(payload: RecordErrorReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = coach.record_error(db, user.id, payload.text, payload.level, payload.error_type or None, payload.topic or None)
    return ok(p.to_dict())


# ---------------- 项4：学习节奏自适应 ----------------
@router.post("/state")
def coach_state(payload: StateReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    state = coach.assess_state(payload.speed, payload.accuracy, payload.confusion_rate)
    pace = coach.recommend_pace(state)
    # 同步写回画像（项5/项8 复用）
    p = coach.get_or_create_profile(db, user.id)
    p.last_state = state
    p.last_state_at = __import__("datetime").datetime.utcnow()
    db.commit()
    return ok({"state": state, "pace": pace})


# ---------------- 项5：跨场景长期记忆 ----------------
@router.get("/profile")
def coach_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(coach.get_profile(db, user.id))


@router.get("/weak-reminder")
def coach_weak_reminder(topic: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"reminder": coach.get_weak_reminder(db, user.id, topic)})


# ---------------- 项6：多维度情绪识别 ----------------
@router.post("/emotion")
def coach_emotion(payload: EmotionReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(coach.detect_emotion(payload.text, payload.signals))


# ---------------- 项7：语音打断 Barge-in（后端支撑） ----------------
_INTERRUPT_FLAGS: dict[str, float] = {}


@router.post("/interrupt")
def coach_interrupt(payload: InterruptReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """请求打断：标记某会话需要立即停止当前 TTS/字幕。

    说明：真正的 barge-in 由前端实现——麦克风持续监听，检测到用户开口即调用本接口
    并停止播放。后端只负责记录"打断信号"供 TTS 流读取。
    """
    key = f"{user.id}:{payload.session_id}"
    _INTERRUPT_FLAGS[key] = time.time()
    return ok({"interrupted": True, "session_id": payload.session_id})


@router.get("/interrupt/status")
def coach_interrupt_status(session_id: str = "default", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = f"{user.id}:{session_id}"
    flagged = key in _INTERRUPT_FLAGS
    if flagged:
        del _INTERRUPT_FLAGS[key]
    return ok({"should_interrupt": flagged})


# ---------------- 项8：语速自适应 ----------------
@router.get("/speech-rate")
def coach_speech_rate(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = coach.get_or_create_profile(db, user.id)
    rate = coach.speech_rate_for(p.prefs, p.last_state)
    return ok({"speech_rate": rate, "state": p.last_state, "prefs": p.prefs or {}})


# ---------------- 项9：形象/声音定制 ----------------
@router.post("/prefs")
def coach_set_prefs(payload: PrefsReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(coach.set_prefs(db, user.id, payload.prefs))


# ---------------- 项10：成就系统 ----------------
@router.get("/badges")
def coach_badges(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"catalog": coach.list_badges(db), "owned": coach.get_profile(db, user.id)["badges"]})


@router.post("/award")
def coach_award(event: str = "experiment_done", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(coach.award_check(db, user.id, event))


# ---------------- 项11 / 项12：视觉纠错 & 多模态问答（规则引擎校验闭环） ----------------
@router.post("/vision-check")
async def coach_vision_check(payload: VisionReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """摄像头/截图描述文本 → 规则引擎判定 → 返回风险点 + 口语提示。

    不演示但链路真实：前端把"画面描述"作为 frame_description 传过来，
    后端按既有规则引擎判定（与文字/语音操作同一条唯一事实源）。
    """
    if not payload.frame_description:
        return ok({"level": "none", "must_warn": False, "tip": "未收到画面描述。"}, )
    result = await AgentService(db).infer(payload.frame_description, "experiment")
    out = coach.vision_advice(result["level"], result.get("consequence", ""), result.get("correction", ""))
    out["source_count"] = len(result.get("source_refs") or [])
    return ok(out)


@router.post("/vision-ask")
async def coach_vision_ask(payload: VisionReq, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """多模态问答：画面描述 + 问题 → 规则引擎判定 + 主题知识回应。

    frame_description 为空时，如实告知需前端先抽帧/描述（不假装能看）。
    """
    if not payload.frame_description:
        return ok({"available": False,
                   "tip": "当前未接入多模态视觉模型，需前端先把画面抽帧并生成描述文本后传入 frame_description。"})
    result = await AgentService(db).infer(payload.frame_description, "experiment")
    out = coach.vision_advice(result["level"], result.get("consequence", ""), result.get("correction", ""))
    out["question"] = payload.question
    out["available"] = True
    return ok(out)
