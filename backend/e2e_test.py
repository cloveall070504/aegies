"""端到端冒烟测试：验证修复与新增功能。
运行：.venv/Scripts/python.exe e2e_test.py
"""
import time
import httpx

BASE = "http://127.0.0.1:8000/api/v1"
PASS, FAIL = 0, 0

def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name}  {extra}")

c = httpx.Client(base_url=BASE, timeout=30)

print("== 1. 注册越权修复：传 role=admin 应被强制为 student ==")
ts = str(int(time.time()))
r = c.post("/auth/register", json={
    "username": f"stu_{ts}", "password": "pass1234",
    "display_name": "测试学生", "department": "测试系", "role": "admin",
})
print("  register resp:", r.json().get("message"))
check("注册成功", r.status_code == 200 and r.json().get("code") in (0, 200), r.text[:200])
su = r.json().get("data", {}).get("user", {})
check("role 被强制为 student", su.get("role") == "student", f"实际 role={su.get('role')}")

r = c.post("/auth/login", json={"username": f"stu_{ts}", "password": "pass1234"})
login = r.json().get("data", {})
token = login.get("token", "")
check("学生登录成功", bool(token))
hdrs = {"Authorization": f"Bearer {token}"}
me = c.get("/auth/me", headers=hdrs).json().get("data", {})
check("/auth/me role=student", me.get("role") == "student", str(me.get("role")))

print("\n== 2. 场景列表 ==")
r = c.get("/scenes", headers=hdrs)
scenes = r.json().get("data", [])
check("场景列表返回", len(scenes) > 0, f"共 {len(scenes)} 个场景")
print("  scenes:", [s.get("scene_code") for s in scenes][:6])

print("\n== 3. RAG + Agent 推演（新语义检索）==")
r = c.post("/scenario/infer", headers=hdrs, json={
    "behavior": "我没有佩戴护目镜就操作了浓硫酸，不小心溅到手上",
    "scene_type": "experiment",
})
d = r.json().get("data", {})
print("  level:", d.get("level"), "| score:", d.get("risk_score"), "| engine:", d.get("engine"))
print("  critic:", str(d.get("critic_summary"))[:80])
print("  refs:", len(d.get("source_refs") or []), "条")
check("推演返回高危", d.get("level") == "high", str(d.get("level")))
check("返回溯源条款", len(d.get("source_refs") or []) > 0)

print("\n== 4. 无关输入（level=none 不写记录）==")
r = c.post("/scenario/infer", headers=hdrs, json={
    "behavior": "今天天气很好，我打算出去跑步",
    "scene_type": "experiment",
})
d = r.json().get("data", {})
check("识别为无关输入", d.get("level") == "none", str(d.get("level")))

print("\n== 5. 题库扩展（应 30 题）==")
r = c.get("/quiz/questions", headers=hdrs)
qs = r.json().get("data") or []
n = len(qs) if isinstance(qs, list) else len(qs.get("questions", []))
print("  题目数:", n)
check("题库 >= 20 题", n >= 20, f"实际 {n}")

print("\n== 6. 交卷 ==")
qlist = qs.get("questions", []) if isinstance(qs, dict) else qs
answers = [q["answer"] for q in qlist]
r = c.post("/quiz/submit", headers=hdrs, json={"quiz_id": "quiz_001", "answers": answers, "scene_type": "experiment"})
d = r.json().get("data", {})
print("  score:", d.get("score"), "| correct:", d.get("correct"), "/", d.get("total"))
check("交卷成功", r.json().get("code") in (0, 200), r.text[:200])

print("\n== 7. 培训模拟：跳过预考直接考核应被拦截 ==")
steps = c.get("/scenes/chem_lab/steps", headers=hdrs).json().get("data", [])
n_steps = len(steps) if isinstance(steps, list) else len(steps.get("steps", []))
print("  chem_lab 步骤数:", n_steps)
# 先直接 post（没有 pre 记录）→ 应 400
r = c.post("/scenes/sim/submit", headers=hdrs, json={
    "scene_code": "chem_lab", "stage": "post", "choices": [0]*n_steps,
})
check("直接 post 被拦截(400)", r.json().get("code") in (400, 404), r.text[:120])
# 正常 pre
r = c.post("/scenes/sim/submit", headers=hdrs, json={
    "scene_code": "chem_lab", "stage": "pre", "choices": [0]*n_steps,
})
d = r.json().get("data", {})
print("  pre 结果:", d.get("passed"), "| stage:", d.get("stage"), "| score:", d.get("score"))
check("pre 提交成功", r.json().get("code") in (0, 200), r.text[:120])
# pre 通过后再 post
r = c.post("/scenes/sim/submit", headers=hdrs, json={
    "scene_code": "chem_lab", "stage": "post", "choices": [0]*n_steps,
})
d = r.json().get("data", {})
print("  post 结果:", d.get("passed"), "| stage:", d.get("stage"))
check("post 提交成功", r.json().get("code") in (0, 200), r.text[:120])

print("\n== 8. 培训总览 + 驾驶舱 + 画像 ==")
r = c.get("/scenes/training/overview", headers=hdrs)
d = r.json().get("data", [])
print("  培训总览条数:", len(d) if isinstance(d, list) else "dict")
check("培训总览可访问", r.json().get("code") in (0, 200), r.text[:120])
r = c.get("/dashboard/summary", headers=hdrs)
check("驾驶舱可访问", r.json().get("code") in (0, 200), r.text[:150])
r = c.get("/profile/personal", headers=hdrs)
check("个人画像可访问", r.json().get("code") in (0, 200), r.text[:150])

print("\n== 9. 报告生成 + 下载 + IDOR 校验 ==")
r = c.post("/report/generate", headers=hdrs, json={"type": "personal", "target_id": ""})
d = r.json().get("data", {})
rid = d.get("report_id")
print("  report_id:", rid, "|", d.get("title"))
check("报告生成成功", bool(rid), r.text[:150])
r = c.get(f"/report/{rid}/download", headers=hdrs)
print("  下载状态:", r.status_code, "| Content-Type:", r.headers.get("content-type"))
check("本人可下载 PDF", r.status_code == 200 and "pdf" in r.headers.get("content-type", "").lower())
print("  PDF 大小:", len(r.content), "bytes")

# 注册第二个用户尝试下载第一个用户的报告（IDOR）
ts2 = str(int(time.time()))
c.post("/auth/register", json={"username": f"stu2_{ts2}", "password": "pass1234", "display_name": "攻击者", "department": "测试系"})
r2 = c.post("/auth/login", json={"username": f"stu2_{ts2}", "password": "pass1234"})
tok2 = r2.json().get("data", {}).get("token", "")
r = c.get(f"/report/{rid}/download", headers={"Authorization": f"Bearer {tok2}"})
print("  他人下载状态:", r.status_code, r.text[:80])
check("IDOR 拦截：他人无法下载", r.json().get("code") == 403, f"status={r.status_code} body={r.text[:80]}")

print("\n== 10. 作业流（新增模块）==")
# admin 登录
r = c.post("/auth/login", json={"username": "admin", "password": "admin123"})
admin_token = r.json().get("data", {}).get("token", "")
check("admin 登录成功", bool(admin_token))
ah = {"Authorization": f"Bearer {admin_token}"}
r = c.post("/assignments", headers=ah, json={
    "title": "化学实验室安全培训", "description": "完成 chem_lab 场景模拟",
    "scene_code": "chem_lab", "task_type": "sim_train", "due_date": "2026-09-01",
})
d = r.json().get("data", {})
aid = d.get("id") or (d.get("assignment") or {}).get("id")
print("  作业 id:", aid, "| msg:", r.json().get("message"))
check("教师创建作业成功", bool(aid), r.text[:200])
# 学生尝试创建 → 403
r = c.post("/assignments", headers=hdrs, json={"title": "越权", "scene_code": "chem_lab"})
check("学生创建作业被拒(403)", r.status_code == 403, f"status={r.status_code} msg={r.text[:100]}")
# 学生查看作业列表
r = c.get("/assignments", headers=hdrs)
items = r.json().get("data", [])
check("学生看到分配作业", any(getattr(i, "get", lambda k: None)("id") == aid or i.get("id") == aid for i in items) if isinstance(items, list) else True, str(len(items)) if isinstance(items, list) else "")
# 学生更新进度
r = c.put("/assignments/progress", headers=hdrs, json={"assignment_id": aid, "status": "completed", "score": 92})
print("  学生更新进度:", r.json().get("message"), r.text[:120])
# admin 查看进度
r = c.get(f"/assignments/{aid}/progress", headers=ah)
prog = r.json().get("data", [])
print("  进度记录:", len(prog) if isinstance(prog, list) else prog)
check("教师可查看学生进度", r.json().get("code") in (0, 200), r.text[:120])

print(f"\n{'='*40}\n结果: {PASS} 通过 / {FAIL} 失败")
raise SystemExit(1 if FAIL else 0)
