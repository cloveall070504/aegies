"""方案3 审计接入回归门禁：复用内存库 fixture，断言诚实性不变量。

- 真过度触发必须为 0（正确操作不得被误判 high/medium，否则破坏诚实边界）；
- 死别名必须为 0（所有 _PARAPHRASE_ALIASES target 必须存在于库）。

该测试随 `pytest tests/` 自动执行，push 时即触发（无需单独步骤）。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.audit_service import run_audit


def test_audit_no_true_over_trigger(session):
    res = run_audit(session)
    assert res["true_over"] == [], f"存在真过度触发(正确操作被判危): {res['true_over']}"


def test_audit_no_dead_aliases(session):
    res = run_audit(session)
    assert res["bad_alias"] == [], f"存在死别名(别名指向不存在规则): {res['bad_alias']}"
