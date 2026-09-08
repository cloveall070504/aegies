"""数字人教练 12 项能力验证。

覆盖：
  1 追问引导 / 2 分层提示 / 3 错因归因 / 4 节奏自适应 / 5 长期记忆 /
  6 情绪识别 / 8 语速自适应 / 9 形象定制 / 10 成就系统 / 11·12 视觉纠错(逻辑层)
  （项7 语音打断为前端实时能力，后端仅提供打断信号接口，见实跑冒烟测试）
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401
from app.services import coach_service as coach
from app.models.user import User


# 独立内存库（避免与 conftest 的 module session 互相污染计数）
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Base.metadata.create_all(engine)
_Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

_counter = {"n": 0}


def _new_user():
    s = _Session()
    _counter["n"] += 1
    uid = _counter["n"]
    if not s.query(User).filter_by(id=uid).first():
        s.add(User(id=uid, username=f"coach_u{uid}", role="student", password_hash="x"))
        s.commit()
    s.close()
    return uid


# ===================== 项1：追问引导 =====================
def test_socratic_question_when_no_answer():
    out = coach.socratic_next("稀释浓硫酸时把水倒进浓硫酸", "", "high")
    assert out["mode"] == "question"
    assert out["topic"] == "dilution"
    assert out["guard"] == "rule_engine"


def test_socratic_deepen_when_correct():
    out = coach.socratic_next("稀释浓硫酸", "应该酸入水，沿杯壁慢慢加", "high")
    assert out["mode"] == "deepen"


def test_socratic_correct_when_wrong_high():
    out = coach.socratic_next("稀释浓硫酸", "先倒水再倒酸", "high")
    assert out["mode"] == "correct"
    assert "暴沸" in out["content"] or "酸入水" in out["content"]


def test_socratic_explain_when_wrong_low():
    out = coach.socratic_next("稀释浓硫酸", "随便倒", "low")
    assert out["mode"] == "explain"


# ===================== 项2：分层提示 =====================
def test_progressive_hints_all_and_level():
    out = coach.progressive_hints("稀释浓硫酸时把水倒进浓硫酸")
    assert out["topic"] == "dilution"
    assert len(out["levels"]) == 3
    lvl2 = coach.progressive_hints("稀释浓硫酸时把水倒进浓硫酸", level=2)
    assert lvl2["level"] == 2
    assert lvl2["hint"] == out["levels"][1]["hint"]


# ===================== 项3：错因归因 =====================
def test_attribute_concept_error():
    out = coach.attribute_error("把水倒进浓硫酸", "", "high")
    assert out["error_type"] == "概念错误"
    assert "概念讲解" in out["resource"]["type"]


def test_attribute_safety_awareness():
    out = coach.attribute_error("徒手拿试剂不戴护目镜", "", "high")
    assert out["error_type"] == "安全意识薄弱"


def test_attribute_memory_when_low():
    out = coach.attribute_error("随便做", "", "low")
    assert out["error_type"] == "记忆偏差"


# ===================== 项4：节奏自适应 =====================
def test_assess_state():
    assert coach.assess_state(3, 0.9, 0.1) == "流畅"
    assert coach.assess_state(2, 0.6, 0.3) == "吃力"
    assert coach.assess_state(1, 0.3, 0.7) == "卡住"


def test_recommend_pace():
    assert coach.recommend_pace("流畅")["speech_rate"] > coach.recommend_pace("卡住")["speech_rate"]


# ===================== 项5：跨场景长期记忆 =====================
def test_profile_records_and_reminder():
    uid = _new_user()
    s = _Session()
    coach.record_error(s, uid, "把水倒进浓硫酸", "high", "概念错误", "dilution")
    coach.record_error(s, uid, "又把水倒进浓硫酸里", "high", "概念错误", "dilution")
    coach.record_error(s, uid, "加热试管对着人", "medium", "操作习惯", "heating_tube")
    prof = coach.get_profile(s, uid)
    dilution = next(x for x in prof["weak_topics"] if x["topic"] == "dilution")
    assert dilution["count"] == 2
    assert prof["error_type_counts"].get("概念错误") == 2
    # 跨场景提醒：当前在做 heating_tube，应提醒 dilution
    rem = coach.get_weak_reminder(s, uid, "heating_tube")
    # 面向用户应显示中文标签，而非内部键（不能出现 topic 原始键 dilution）
    assert "浓硫酸稀释" in rem
    assert "dilution" not in rem
    s.close()


# ===================== 项6：情绪识别 =====================
def test_emotion_detect():
    assert coach.detect_emotion("烦死了不想学")["emotion"] == "厌学"
    assert coach.detect_emotion("", {"rapid_repeat_wrong": True})["emotion"] == "挫败"
    assert coach.detect_emotion("", {"session_minutes": 50, "error_rate": 0.6})["emotion"] == "倦怠"
    assert coach.detect_emotion("今天学得不错")["emotion"] == "中性"


# ===================== 项8：语速自适应 =====================
def test_speech_rate():
    assert coach.speech_rate_for(None, "流畅") == 1.15
    assert coach.speech_rate_for({"speech_rate": 0.9}, "卡住") == 0.9
    # 偏好夹在合理区间
    assert coach.speech_rate_for({"speech_rate": 5.0}, "流畅") == 1.3


# ===================== 项9：形象/声音定制 =====================
def test_prefs_set_and_get():
    uid = _new_user()
    s = _Session()
    prof = coach.set_prefs(s, uid, {"gender": "女", "voice_type": "温柔", "speech_rate": 1.0})
    assert prof["prefs"]["voice_type"] == "温柔"
    # 不允许的键应被过滤
    coach.set_prefs(s, uid, {"hack": "x"})
    prof2 = coach.get_profile(s, uid)
    assert "hack" not in prof2["prefs"]
    s.close()


# ===================== 项10：成就系统 =====================
def test_achievement_unlock():
    uid = _new_user()
    s = _Session()
    r1 = coach.award_check(s, uid, "experiment_done")
    assert any(b["code"] == "first_exp" for b in r1["newly_unlocked"])
    # 累计到 5 个实验解锁 exp_5（中间任一步即解锁，故最终检查 profile 已拥有）
    for _ in range(5):
        coach.award_check(s, uid, "experiment_done")
    assert "exp_5" in coach.get_profile(s, uid)["badges"]
    # 累计 3 次避险解锁 safe_3（同理最终检查已拥有）
    for _ in range(3):
        coach.award_check(s, uid, "incident_avoided")
    assert "safe_3" in coach.get_profile(s, uid)["badges"]
    s.close()


# ===================== 项11·12：视觉纠错（逻辑层） =====================
def test_vision_advice_high_must_warn():
    out = coach.vision_advice("high", "会暴沸飞溅灼伤", "会暴沸飞溅，请酸入水")
    assert out["must_warn"] is True
    assert "暴沸" in out["tip"]


def test_vision_advice_low_no_risk():
    out = coach.vision_advice("low", "", "")
    assert out["must_warn"] is False
    assert "安全" in out["tip"]
