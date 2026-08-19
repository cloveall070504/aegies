"""可信化冒烟：临时库 + ENABLE_OLLAMA=true（模拟未装 Ollama 的普通电脑）。

验证：Ollama 调用快速失败降级、引擎诚实标注、置信度/证据链返回、清晰违规高置信。
结束后删除临时库与脚本。
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///./smoke_trust.db"
os.environ["ENABLE_OLLAMA"] = "true"   # 故意开启，验证未安装时快速降级
os.environ["APP_TEST"] = "1"

from fastapi.testclient import TestClient
from app.main import app

with TestClient(app, base_url="http://testserver/api/v1/") as c:
    # 登录种子学生
    r = c.post("/auth/login", json={"username": "student", "password": "123456"})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['data']['token']}"}

    cases = [
        ("清晰高危", "稀释浓硫酸时将水倒入浓硫酸中", "chem_lab"),
        ("中危", "实验结束后未清理台面直接离开", "chem_lab"),
        ("无关", "今天天气很好，我打算出去跑步", "chem_lab"),
    ]
    for name, beh, sc in cases:
        r = c.post("/scenario/infer", headers=h, json={
            "behavior": beh, "scene_type": "experiment", "scene_code": sc,
        })
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        print(f"\n=== {name} ===")
        print(f"  level={d['level']} score={d['risk_score']} engine={d['engine']} "
              f"trust_mode={d['trust_mode']} verified_by={d['verified_by']} "
              f"confidence={d['confidence']} divergence={d['critic_divergence']}")
        print(f"  evidence.signal_count={d['evidence']['signal_count']} "
              f"semantic_level={d['evidence']['semantic_level']} "
              f"domain={d['evidence']['domain_input']}")
        print(f"  keyword_hits.high={d['evidence']['keyword_hits']['high']}")
        print(f"  matched_clauses={[round(x['match_score'],2) for x in d['evidence']['matched_clauses']]}")
        print(f"  ai_checked={d['ai_checked']} critic_summary={d['critic_summary'][:40]}")

print("\nSMOKE OK")
