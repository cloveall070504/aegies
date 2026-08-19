"""反馈闭环（A1/A2/A3）接口测试：风险点编辑审核、学生错误回流、评分透明化。

覆盖：
- A1 教师/管理员维护风险知识库（列表/新建/编辑/审核/删除规则）
- A2 学生对推演记录提交反馈 → 教师审核队列 → 处理
- A3 推演结果携带可解释 score_breakdown
"""
import pytest


RISKY_STEP = "实验前未佩戴护目镜，直接打开浓硫酸试剂瓶，将水倒入浓硫酸中稀释"


# ---------- A1 风险点管理 ----------
def test_teacher_sees_all_risk_points(client, teacher_headers):
    r = client.get("/risk-points", headers=teacher_headers)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["total"] >= 1
    assert isinstance(d["items"], list)


def test_student_only_sees_reviewed_risk_points(client, student_headers):
    # 学生不应看到 reviewed=0/2 的条目；若种子全为 reviewed=1，总数应 >0
    r = client.get("/risk-points", headers=student_headers)
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    assert all(it["reviewed"] == 1 for it in items)


def test_teacher_create_review_approve_reject_flow(client, teacher_headers, student_headers):
    # 新建 → 进入待审核
    c = client.post("/risk-points", headers=teacher_headers, json={
        "description": "测试风险点_待审核", "level": "high", "weight": 0.9, "clause_ref": "测试条款",
    })
    assert c.status_code == 200, c.text
    rp = c.json()["data"]
    assert rp["reviewed"] == 0 and rp["source"] == "custom"

    # 审核通过
    rv = client.post(f"/risk-points/{rp['id']}/review", headers=teacher_headers, json={"action": "approve"})
    assert rv.status_code == 200, rv.text
    assert rv.json()["data"]["reviewed"] == 1

    # 学生现在能看到它
    s = client.get("/risk-points", headers=student_headers)
    ids = [it["id"] for it in s.json()["data"]["items"]]
    assert rp["id"] in ids

    # 驳回后再隐藏
    rj = client.post(f"/risk-points/{rp['id']}/review", headers=teacher_headers, json={"action": "reject"})
    assert rj.json()["data"]["reviewed"] == 2
    s2 = client.get("/risk-points", headers=student_headers)
    assert rp["id"] not in [it["id"] for it in s2.json()["data"]["items"]]

    # 自建风险点可删除；种子不可删
    dele = client.delete(f"/risk-points/{rp['id']}", headers=teacher_headers)
    assert dele.status_code == 200, dele.text


def test_student_cannot_create_risk_point(client, student_headers):
    r = client.post("/risk-points", headers=student_headers, json={"description": "x", "level": "low"})
    assert r.status_code in (401, 403)


def test_seed_risk_point_not_deletable(client, teacher_headers, admin_headers):
    lst = client.get("/risk-points", headers=teacher_headers, params={"source": "seed", "page_size": 5})
    seed = next((it for it in lst.json()["data"]["items"] if it["source"] == "seed"), None)
    assert seed is not None
    d = client.delete(f"/risk-points/{seed['id']}", headers=teacher_headers)
    assert d.status_code == 400


# ---------- A3 评分透明化 ----------
def test_simulate_returns_score_breakdown(client, student_headers):
    r = client.post("/simulate/step", headers=student_headers, json={"step": RISKY_STEP, "scene_id": "chem_lab", "history": []})
    assert r.status_code == 200, r.text
    res = r.json()["data"]
    assert res["level"] in ("high", "medium", "low")
    assert isinstance(res.get("score_breakdown"), list) and len(res["score_breakdown"]) > 0
    assert all("factor" in b and "delta" in b for b in res["score_breakdown"])
    # 落库记录才有 record_id（非 none 必然有）
    assert res["level"] != "none"
    assert isinstance(res.get("record_id"), int)


def test_infer_returns_score_breakdown(client, student_headers):
    r = client.post("/scenario/infer", headers=student_headers, json={"behavior": RISKY_STEP, "scene_code": "chem_lab"})
    assert r.status_code == 200, r.text
    res = r.json()["data"]
    assert isinstance(res.get("score_breakdown"), list) and len(res["score_breakdown"]) > 0


# ---------- A2 学生错误回流闭环 ----------
def test_feedback_submit_pending_resolve_loop(client, student_headers, teacher_headers):
    # 1) 学生推演拿到 record_id
    sim = client.post("/simulate/step", headers=student_headers, json={"step": RISKY_STEP, "scene_id": "chem_lab", "history": []})
    rec_id = sim.json()["data"]["record_id"]
    assert isinstance(rec_id, int)

    # 2) 学生提交反馈（认为误判）
    fb = client.post("/feedback/submit", headers=student_headers, json={
        "record_id": rec_id, "feedback": "这一步其实有防护，不应判高危", "is_misjudge": True,
    })
    assert fb.status_code == 200, fb.text
    assert fb.json()["data"]["feedback_status"] == "pending"

    # 3) 教师审核队列能看到，且含评分明细
    pend = client.get("/feedback/pending", headers=teacher_headers)
    assert pend.status_code == 200, pend.text
    items = pend.json()["data"]["items"]
    mine = next((it for it in items if it["record_id"] == rec_id), None)
    assert mine is not None
    assert mine["is_misjudge"] == 1 and mine["student_feedback"]
    assert isinstance(mine["score_breakdown"], list)

    # 4) 教师处理
    rs = client.post(f"/feedback/{rec_id}/resolve", headers=teacher_headers, json={"action": "accepted"})
    assert rs.status_code == 200, rs.text
    assert rs.json()["data"]["feedback_status"] == "accepted"

    # 处理后不再出现在待处理队列
    pend2 = client.get("/feedback/pending", headers=teacher_headers)
    assert all(it["record_id"] != rec_id for it in pend2.json()["data"]["items"])


def test_student_cannot_resolve_feedback(client, student_headers):
    # 学生无审核权限
    r = client.post("/feedback/999999/resolve", headers=student_headers, json={"action": "resolved"})
    assert r.status_code in (401, 403, 404)
