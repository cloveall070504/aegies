"""反向 RAG 升级 · D 方案（时序/因果链识别）验证。

覆盖：
  1) 顺序错误（点燃先于验纯 / 熄灯先于移导管）被识别；
  2) 顺序正确不误报；
  3) 经 analyze_text 返回 causal_findings 且不影响风险评级（诚实不变量）。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.causality_service import detect_causality
from app.services.scan_service import analyze_text


def test_causal_gas_purity_wrong_order():
    steps = ["点燃酒精灯加热试管", "先验纯收集到的氢气"]
    issues = detect_causality(steps)
    ids = [i["id"] for i in issues]
    assert "gas_light_purity" in ids
    bad = [i for i in issues if i["id"] == "gas_light_purity"][0]
    assert bad["step_index"] == 0
    assert bad["suggestion"]


def test_causal_gas_purity_correct_order():
    steps = ["先验纯收集到的氢气", "点燃酒精灯加热试管"]
    issues = detect_causality(steps)
    assert "gas_light_purity" not in [i["id"] for i in issues]


def test_causal_move_tube_wrong_order():
    steps = ["熄灭酒精灯", "将导管移出水面"]
    issues = detect_causality(steps)
    assert "move_tube_before_extinguish" in [i["id"] for i in issues]


def test_causal_move_tube_correct_order():
    steps = ["将导管移出水面", "熄灭酒精灯"]
    issues = detect_causality(steps)
    assert "move_tube_before_extinguish" not in [i["id"] for i in issues]


def test_causal_boiling_chip_missing_before_heat():
    steps = ["将液体倒入烧杯并直接加热至沸腾"]
    issues = detect_causality(steps)
    assert "boiling_chip_before_heat" in [i["id"] for i in issues]


def test_causal_via_analyze_text(session):
    res = analyze_text(session, "第一步点燃酒精灯。第二步先验纯氢气再收集。", "chem_lab")
    assert "causal_findings" in res
    ids = [i["id"] for i in res["causal_findings"]]
    assert "gas_light_purity" in ids
    # 不参与风险评级：summary 结构不受影响
    assert set(res["summary"].keys()) == {"high", "medium", "low", "none"}


def test_causal_no_false_positive_on_correct_plan(session):
    text = (
        "检查装置气密性。装入大理石和稀盐酸。先通冷凝水再加热蒸馏。"
        "先验纯氢气后点燃。集中加热前先预热。"
        "皮肤沾到试剂立即用大量水冲洗再就医。"
    )
    res = analyze_text(session, text, "chem_lab")
    ids = [i["id"] for i in res["causal_findings"]]
    assert ids == [], f"误报时序问题: {ids}"
