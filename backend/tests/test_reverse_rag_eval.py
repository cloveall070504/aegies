"""反向 RAG 升级 · 评测套件（方案4：回归护栏）。

核心断言——「诚实不变量」：
- 危险操作（high/medium）必须列出具体风险点（all_risks 非空），否则等于把危险说成无物；
- 安全/正确操作（low）必须不列具体风险点（all_risks 为空），否则等于把安全说成飞溅灼伤。
任一违反即视为诚实性回退，测试失败。

另覆盖：
- 方案1 缺失安全步骤检测；
- 方案2 结构化槽位分类器的关键边界（正确稀释/禁止陈述/水入酸危险/尾气正确吸收）。
"""
import pytest

from app.services.scan_service import analyze_text
from app.services.agent_service import (
    _is_prohibition_statement,
    _is_correct_safe_operation,
)
from app.services.slot_classifier import classify_safety
from app.services.required_steps import detect_missing_steps

# 危险案例：期望 high/medium，且须列出具体风险点
DANGER = [
    "稀释浓硫酸时将水倒入浓硫酸中",
    "用嘴通过移液管吸取腐蚀性或有毒试剂",
    "实验时不佩戴护目镜直接操作腐蚀性试剂",
    "加热试管时试管口朝向人",
    "将酸性废液直接倒入下水道",
    "皮肤沾到腐蚀性试剂后未立即用大量流动水冲洗",
    "闻试剂气味时鼻子直接凑近瓶口",
    "未穿实验服未扎长发进行化学实验",
    "加热试管内液体超过容积三分之一导致暴沸喷溅",
]

# 安全/正确案例：期望 low，且不列任何具体风险点
SAFE = [
    "稀释浓硫酸应将浓硫酸缓慢倒入水中并不断搅拌",
    "实验结束废液要倒入指定废液缸",
    "我不可以把水倒进浓硫酸里",
    "实验时千万不能直接把水倒入浓硫酸",
    "绝对禁止用嘴去吸移液管里的试剂",
    "佩戴护目镜并穿好实验服后再操作",
    "容量瓶定容时视线与刻度线水平",
    "皮肤沾到试剂立即用大量水冲洗",
    "加热试管内液体不超过三分之一并不断移动",
    "产生的氯气要用碱液吸收后再排放",
    "废液要回收到指定的废液桶里",
]


@pytest.mark.parametrize("text", DANGER)
def test_danger_lists_specific_risk(session, text):
    res = analyze_text(session, text, "")
    assert res["findings"], f"无 finding: {text}"
    f = res["findings"][0]
    assert f["level"] in ("high", "medium"), f"危险步未判危: {text} -> {f['level']}"
    assert len(f["all_risks"]) >= 1, f"危险步未列具体风险: {text} level={f['level']}"


@pytest.mark.parametrize("text", SAFE)
def test_safe_lists_no_specific_risk(session, text):
    res = analyze_text(session, text, "")
    assert res["findings"], f"无 finding: {text}"
    f = res["findings"][0]
    assert f["level"] == "low", f"安全步未判低: {text} -> {f['level']}"
    assert len(f["all_risks"]) == 0, f"安全步却列具体风险(诚实性回退): {text}"


def test_trace_and_missing_steps_wired(session):
    """方案4 溯源 + 方案1 缺失步骤 已接入 analyze_text 输出。"""
    res = analyze_text(session, "稀释浓硫酸时将水倒入浓硫酸中", "")
    assert "missing_steps" in res
    assert "trace" in res["findings"][0]
    assert res["findings"][0]["trace"]["safe_override"] in (True, False)
    # 危险步同时应被识别为缺失多项安全步骤
    assert len(res["missing_steps"]) >= 1


def test_prohibition_boundary():
    """否定/禁止陈述判低；真实遗漏防护仍判危（不误降）。"""
    assert _is_prohibition_statement("我不可以把水倒进浓硫酸里") is True
    assert _is_prohibition_statement("未佩戴护目镜操作腐蚀性试剂") is False


def test_correct_operation_boundary():
    assert _is_correct_safe_operation(
        "稀释浓硫酸应将浓硫酸缓慢倒入水中并不断搅拌"
    ) is True


def test_slot_classifier():
    """方案2 结构化槽位分类器关键边界。"""
    # 正确稀释（酸入水）
    assert classify_safety(
        "稀释时把浓硫酸缓缓加入水中并不断搅拌"
    )["intent"] == "correct_safe"
    # 禁止陈述
    assert classify_safety("禁止向浓硫酸中注入水")["intent"] in (
        "prohibition", "correct_safe",
    )
    # 水入酸（真实危险）
    assert classify_safety("将水倒入浓硫酸")["intent"] == "danger"
    # 尾气正确吸收（旧 _SAFE_VERBS 无法命中，槽位可补强）
    assert classify_safety(
        "产生的氯气要用碱液吸收后再排放"
    )["intent"] == "correct_safe"


def test_missing_steps_detection():
    miss = detect_missing_steps("稀释浓硫酸时将水倒入浓硫酸中")
    ids = [m["id"] for m in miss]
    assert "ppe_goggles" in ids and "waste_sort" in ids

    covered = detect_missing_steps(
        "我佩戴护目镜、穿好实验服，将废液倒入指定废液缸，实验后洗手离开"
    )
    cov_ids = [m["id"] for m in covered]
    assert "ppe_goggles" not in cov_ids
    assert "waste_sort" not in cov_ids
