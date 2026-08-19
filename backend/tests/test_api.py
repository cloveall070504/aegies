"""API 端到端测试（pytest + FastAPI TestClient，进程内、隔离数据库）。

运行方式（在 backend/ 目录）：
    .venv/Scripts/python.exe -m pytest tests/ -q

无需手动启动后端；数据库为隔离的临时 SQLite 库，自动建表 + 种子。
"""
# ============================================================
# 基础可用性
# ============================================================
def test_health(client):
    # 注意：conftest 的 TestClient 已通过 base_url 注入 /api/v1 前缀，
    # 因此用例用相对路径 /health 即可命中真实路由 /api/v1/health。
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()["data"]
    # 深度健康检查：整体状态为 ok/degraded，且含依赖组件明细
    assert body["status"] in ("ok", "degraded")
    assert "components" in body
    assert "database" in body["components"]


# ============================================================
# 认证与鉴权
# ============================================================
def test_register_role_downgrade(client, ts):
    r = client.post("/auth/register", json={
        "username": f"stu_{ts}", "password": "pass1234",
        "display_name": "测试学生", "department": "测试系", "role": "admin",
    })
    assert r.status_code == 200
    assert r.json()["data"]["user"]["role"] == "student"


def test_login_and_me(client, student_headers):
    me = client.get("/auth/me", headers=student_headers).json()["data"]
    assert me["role"] == "student"


# ============================================================
# 场景系统
# ============================================================
def test_scene_list(client, student_headers):
    scenes = client.get("/scenes", headers=student_headers).json()["data"]
    assert isinstance(scenes, list) and len(scenes) > 0
    codes = [s["scene_code"] for s in scenes]
    assert "chem_lab" in codes


def test_scenario_infer_high(client, student_headers):
    r = client.post("/scenario/infer", headers=student_headers, json={
        "behavior": "稀释浓硫酸时将水倒入酸中", "scene_type": "experiment", "scene_code": "chem_lab",
    })
    d = r.json()["data"]
    assert d["level"] in ("high", "medium")
    assert d["risk_score"] > 0


def test_scenario_infer_irrelevant(client, student_headers):
    r = client.post("/scenario/infer", headers=student_headers, json={
        "behavior": "今天天气很好，我打算出去跑步", "scene_type": "experiment", "scene_code": "chem_lab",
    })
    d = r.json()["data"]
    assert d["level"] == "none"


# ============================================================
# 推演可信化（AI 可信化改造：置信度 / 证据链 / 诚实引擎标注 / 防幻觉）
# ============================================================
def test_scenario_infer_trust_fields(client, student_headers):
    """无 Ollama 时走规则引擎，必须返回可信化字段且诚实标注。"""
    r = client.post("/scenario/infer", headers=student_headers, json={
        "behavior": "未佩戴护目镜操作腐蚀性试剂", "scene_type": "experiment", "scene_code": "chem_lab",
    })
    assert r.status_code == 200
    d = r.json()["data"]
    # 置信度必须在 [0,1]
    assert 0.0 <= d["confidence"] <= 1.0
    # 证据链存在
    assert isinstance(d["evidence"], dict)
    assert d["evidence"]["signal_count"] >= 1
    # 诚实标注：规则引擎为真相源，未启用 Ollama
    assert d["engine"] == "rule"
    assert d["trust_mode"] == "rule_deterministic"
    assert d["verified_by"] == "rule_engine"
    assert d["critic_divergence"] is False
    # 命中了高危风险词
    assert "未佩戴" in d["evidence"]["keyword_hits"]["high"]


def test_scenario_infer_high_confidence(client, student_headers):
    """清晰高危违规：规则引擎高置信，置信度应 >= 0.6。"""
    r = client.post("/scenario/infer", headers=student_headers, json={
        "behavior": "稀释浓硫酸时将水倒入浓硫酸中", "scene_type": "experiment", "scene_code": "chem_lab",
    })
    d = r.json()["data"]
    assert d["level"] == "high"
    assert d["confidence"] >= 0.6
    assert d["evidence"]["semantic_level"] == "high"


def test_scenario_infer_irrelevant_low_confidence(client, student_headers):
    """无关输入：level=none，且证据信号数为 0（不会被错判为风险）。"""
    r = client.post("/scenario/infer", headers=student_headers, json={
        "behavior": "今天天气很好，我打算出去跑步", "scene_type": "experiment", "scene_code": "chem_lab",
    })
    d = r.json()["data"]
    assert d["level"] == "none"
    assert d["evidence"]["signal_count"] == 0
    assert d["confidence"] < 0.6


# ============================================================
# 自测题库
# ============================================================
def test_quiz_flow_all_correct(client, student_headers):
    qs = client.get("/quiz/questions", params={"scene_code": "chem_lab"}, headers=student_headers).json()["data"]
    questions = qs["questions"]
    assert len(questions) > 0
    answers = [q["answer"] for q in questions]
    r = client.post("/quiz/submit", json={
        "quiz_id": "quiz_001", "answers": answers,
        "scene_type": "experiment", "scene_code": "chem_lab",
    }, headers=student_headers)
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["score"] == 100
    assert d["correct"] == len(questions)


def test_quiz_flow_wrong_answers(client, student_headers):
    qs = client.get("/quiz/questions", params={"scene_code": "chem_lab"}, headers=student_headers).json()["data"]
    questions = qs["questions"]
    # 构造每个题都选"非正确项"
    answers = []
    for q in questions:
        n = len(q["options"])
        wrong = (q["answer"] + 1) % n if n > 1 else 0
        answers.append(wrong)
    r = client.post("/quiz/submit", json={
        "quiz_id": "quiz_001", "answers": answers,
        "scene_type": "experiment", "scene_code": "chem_lab",
    }, headers=student_headers)
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["correct"] == 0
    assert d["score"] == 0


def test_quiz_submit_mismatch_count(client, student_headers):
    r = client.post("/quiz/submit", json={
        "quiz_id": "quiz_001", "answers": [0],
        "scene_type": "experiment", "scene_code": "chem_lab",
    }, headers=student_headers)
    assert r.status_code == 400


# ============================================================
# 分步骤模拟培训（预考 -> 考核）
# ============================================================
def test_sim_train_pre_then_post(client, student_headers):
    steps = client.get("/scenes/chem_lab/steps", headers=student_headers).json()["data"]["steps"]
    assert len(steps) == 5
    correct = [next(i for i, o in enumerate(s["options"]) if o.get("correct")) for s in steps]

    r = client.post("/scenes/sim/submit", json={
        "scene_code": "chem_lab", "stage": "pre", "choices": correct,
    }, headers=student_headers)
    assert r.status_code == 200
    assert r.json()["data"]["passed"] is True

    r = client.post("/scenes/sim/submit", json={
        "scene_code": "chem_lab", "stage": "post", "choices": correct,
    }, headers=student_headers)
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["passed"] is True
    assert d["score"] == 100


def test_sim_train_post_without_pre_rejected(client, new_student):
    # 使用全新学生，确保对 chem_lab 没有任何预考记录
    _, headers, _ = new_student
    steps = client.get("/scenes/chem_lab/steps", headers=headers).json()["data"]["steps"]
    correct = [next(i for i, o in enumerate(s["options"]) if o.get("correct")) for s in steps]
    r = client.post("/scenes/sim/submit", json={
        "scene_code": "chem_lab", "stage": "post", "choices": correct,
    }, headers=headers)
    assert r.status_code == 400


# ============================================================
# 作业管理（RBAC + 进度 + 批改）
# ============================================================
def test_assignment_flow(client, admin_headers, teacher_headers, student_headers):
    r = client.post("/assignments", json={
        "title": "化学安全培训", "description": "完成 chem_lab 模拟",
        "scene_code": "chem_lab", "task_type": "sim_train", "due_date": "2026-09-01",
    }, headers=admin_headers)
    assert r.status_code == 200
    aid = r.json()["data"]["id"]
    assert aid

    # 学生越权创建 -> 403
    r = client.post("/assignments", json={"title": "越权作业", "scene_code": "chem_lab"}, headers=student_headers)
    assert r.status_code == 403

    # 学生能看到分配给自己的作业
    items = client.get("/assignments", headers=student_headers).json()["data"]
    assert any(i["id"] == aid for i in items)

    # 学生更新进度
    r = client.put("/assignments/progress", json={
        "assignment_id": aid, "status": "completed", "score": 92,
    }, headers=student_headers)
    assert r.status_code == 200

    # 教师查看进度
    prog = client.get(f"/assignments/{aid}/progress", headers=teacher_headers).json()["data"]
    assert prog["total"] >= 1
    stu = next(p for p in prog["students"] if p["status"] == "completed")
    assert stu["score"] == 92

    # 教师批改
    r = client.put(f"/assignments/{aid}/grade", json={
        "assignment_id": aid, "user_id": stu["user_id"], "score": 95, "comment": "good",
    }, headers=teacher_headers)
    assert r.status_code == 200

    # 成绩册可见批改
    gb = client.get(f"/assignments/{aid}/gradebook", headers=teacher_headers).json()["data"]
    graded = next(p for p in gb["students"] if p["user_id"] == stu["user_id"])
    assert graded["graded"] is True
    assert graded["score"] == 95


# ============================================================
# 报告生成 / 下载 / IDOR 校验
# ============================================================
def test_report_generate_download_and_idor(client, student_headers, new_student):
    r = client.post("/report/generate", json={"type": "personal", "target_id": ""}, headers=student_headers)
    assert r.status_code == 200
    rid = r.json()["data"]["report_id"]
    assert rid

    r = client.get(f"/report/{rid}/download", headers=student_headers)
    assert r.status_code == 200
    assert "pdf" in r.headers.get("content-type", "").lower()

    # 其他用户无法下载（IDOR 校验）
    _, other_headers, _ = new_student
    r = client.get(f"/report/{rid}/download", headers=other_headers)
    assert r.status_code == 403


# ============================================================
# 驾驶舱 / 画像
# ============================================================
def test_dashboard_and_profile(client, student_headers):
    r = client.get("/dashboard/summary", headers=student_headers)
    assert r.status_code == 200
    r = client.get("/profile/personal", headers=student_headers)
    assert r.status_code == 200


# ============================================================
# 教师内容创作台：场景 + 步骤 CRUD（RBAC）
# ============================================================
def test_teacher_scene_and_step_crud(client, teacher_headers, ts):
    code = f"custom_{ts}"
    # 1) 教师新建场景
    r = client.post("/scenes", headers=teacher_headers, json={
        "scene_code": code, "name": "自定义实验", "icon": "🧪", "category": "custom",
        "description": "测试场景", "theme_name": "student",
    })
    assert r.status_code == 200
    assert r.json()["data"]["scene_code"] == code

    # 2) 新增步骤
    opts = [
        {"label": "正确操作", "correct": True, "consequence": "", "explanation": "规范做法"},
        {"label": "错误操作", "correct": False, "consequence": "受伤", "explanation": ""},
    ]
    r = client.post(f"/scenes/{code}/steps", headers=teacher_headers, json={
        "scene_code": code, "step_order": 1, "step_title": "第1步",
        "step_text": "情境", "options": opts, "risk_level": "high", "step_hint": "小心",
    })
    assert r.status_code == 200
    step_id = r.json()["data"]["id"]
    assert step_id

    # 步骤出现在列表中
    steps = client.get(f"/scenes/{code}/steps", headers=teacher_headers).json()["data"]["steps"]
    assert len(steps) == 1

    # 3) 编辑步骤（全量覆盖）
    opts2 = [
        {"label": "正确操作2", "correct": True, "consequence": "", "explanation": "规范"},
        {"label": "错误操作2", "correct": False, "consequence": "重伤", "explanation": ""},
        {"label": "中性操作", "correct": False, "consequence": "", "explanation": ""},
    ]
    r = client.put(f"/scenes/{code}/steps/{step_id}", headers=teacher_headers, json={
        "scene_code": code, "step_order": 1, "step_title": "第1步改",
        "step_text": "情境改", "options": opts2, "risk_level": "medium", "step_hint": "提示改",
    })
    assert r.status_code == 200
    assert r.json()["data"]["step_title"] == "第1步改"
    assert len(r.json()["data"]["options"]) == 3

    # 4) 删除步骤
    r = client.delete(f"/scenes/{code}/steps/{step_id}", headers=teacher_headers)
    assert r.status_code == 200
    steps = client.get(f"/scenes/{code}/steps", headers=teacher_headers).json()["data"]["steps"]
    assert len(steps) == 0

    # 5) 删除场景
    r = client.delete(f"/scenes/{code}", headers=teacher_headers)
    assert r.status_code == 200


def test_student_cannot_author_scene(client, student_headers, ts):
    r = client.post("/scenes", headers=student_headers, json={
        "scene_code": f"stu_{ts}", "name": "学生越权场景",
    })
    assert r.status_code == 403


# ============================================================
# 教师内容创作台：题库单题 CRUD（RBAC）
# ============================================================
def test_teacher_quiz_question_crud(client, teacher_headers, ts):
    qtext = f"测试题目_{ts}"
    # 1) 新建
    body = {
        "question": qtext, "options": ["A", "B", "C"], "answer": 1,
        "analysis": "解析", "scene_type": "experiment", "scene_code": "chem_lab",
    }
    r = client.post("/quiz/questions", headers=teacher_headers, json=body)
    assert r.status_code == 200
    qid = r.json()["data"]["id"]
    assert qid

    # 出现在管理列表
    items = client.get("/quiz/questions/managed", headers=teacher_headers).json()["data"]["questions"]
    assert any(q["id"] == qid for q in items)

    # 2) 编辑
    body["answer"] = 2
    body["question"] = qtext + "_改"
    r = client.put(f"/quiz/questions/{qid}", headers=teacher_headers, json=body)
    assert r.status_code == 200
    assert r.json()["data"]["answer"] == 2

    # 3) 删除
    r = client.delete(f"/quiz/questions/{qid}", headers=teacher_headers)
    assert r.status_code == 200


def test_student_cannot_author_question(client, student_headers, ts):
    r = client.post("/quiz/questions", headers=student_headers, json={
        "question": f"越权_{ts}", "options": ["A", "B"], "answer": 0,
    })
    assert r.status_code == 403


# ===================== 用户管理（admin only） =====================

def test_user_management_requires_admin(client, student_headers, teacher_headers):
    # 学生 / 教师均不可访问用户列表
    assert client.get("/auth/users", headers=student_headers).status_code == 403
    assert client.get("/auth/users", headers=teacher_headers).status_code == 403


def test_admin_create_and_list_user(client, admin_headers, ts):
    uname = f"tea_{ts}"
    r = client.post("/auth/users", headers=admin_headers, json={
        "username": uname, "password": "teacher123", "role": "teacher",
        "display_name": "新教师", "department": "化学系",
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["role"] == "teacher"

    # 列表应能看到刚创建的用户
    lst = client.get("/auth/users", headers=admin_headers, params={"role": "teacher"}).json()["data"]
    assert any(u["username"] == uname for u in lst["items"])


def test_admin_cannot_delete_self(client, admin_headers):
    me = client.get("/auth/me", headers=admin_headers).json()["data"]
    r = client.delete(f"/auth/users/{me['id']}", headers=admin_headers)
    assert r.status_code == 400  # 不能删除自己


def test_admin_update_role_and_disable(client, admin_headers, ts):
    uname = f"stu_{ts}"
    created = client.post("/auth/users", headers=admin_headers, json={
        "username": uname, "password": "student123", "role": "student",
    }).json()["data"]
    uid = created["id"]

    # 升级为教师
    r = client.put(f"/auth/users/{uid}", headers=admin_headers, json={"role": "teacher"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["role"] == "teacher"

    # 停用
    r = client.put(f"/auth/users/{uid}", headers=admin_headers, json={"is_active": False})
    assert r.status_code == 200
    assert r.json()["data"]["is_active"] is False


def test_admin_rejects_bad_role(client, admin_headers, ts):
    r = client.post("/auth/users", headers=admin_headers, json={
        "username": f"x_{ts}", "password": "pw123456", "role": "superuser",
    })
    assert r.status_code == 400

