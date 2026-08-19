"""C 项内容厚度测试：C1 场景内容扩充 + C2 题型多样化与自动批改。

运行（backend/ 目录）：
    .venv/Scripts/python.exe -m pytest tests/test_content_c.py -q

依赖 conftest 的进程内 TestClient（隔离内存库 + Alembic 建表 + 种子）。
"""
from app.main import app  # noqa: F401  (确保 lifespan 种子在 import 时可用)


# ============================================================
# C1：内置真实化学实验场景扩充（≥5 个）
# ============================================================
def test_scene_list_includes_new_experiments(client, student_headers):
    scenes = client.get("/scenes", headers=student_headers).json()["data"]
    codes = {s["scene_code"] for s in scenes}
    # 原 chem_lab + 4 个新真实实验场景
    for required in ("chem_lab", "chem_titration", "chem_gas_prep",
                     "chem_distillation", "chem_solution_prep"):
        assert required in codes, f"缺失场景 {required}"
    assert len(codes) >= 5


def test_new_scene_steps_exist(client, student_headers):
    for code in ("chem_titration", "chem_gas_prep", "chem_distillation", "chem_solution_prep"):
        steps = client.get(f"/scenes/{code}/steps", headers=student_headers).json()["data"]["steps"]
        assert len(steps) >= 4, f"{code} 步骤数不足：{len(steps)}"
        # 每步含选项与风险标注
        for s in steps:
            assert s["options"], f"{code} 步骤缺少选项"
            assert any(o.get("correct") for o in s["options"]), f"{code} 步骤无正确选项"


def test_new_scene_quiz_questions_reachable(client, student_headers):
    # 每个新场景都应有专属题（取题接口按 scene_code 过滤）
    for code, expect in (("chem_titration", 3), ("chem_gas_prep", 3),
                         ("chem_distillation", 3), ("chem_solution_prep", 3)):
        body = client.get("/quiz/questions", params={"scene_code": code},
                          headers=student_headers).json()["data"]
        qs = body["questions"]
        assert len(qs) == expect, f"{code} 应有 {expect} 题，实际 {len(qs)}"
        for q in qs:
            assert q["scene_code"] == code
            assert q["qtype"] == "choice"


# ============================================================
# C2：题型多样化与自动批改
# ============================================================
def test_choice_grading_builtin_scene(client, student_headers):
    body = client.get("/quiz/questions", params={"scene_code": "chem_titration"},
                      headers=student_headers).json()["data"]
    qs = body["questions"]
    assert len(qs) == 3

    # 全对
    r = client.post("/quiz/submit", json={
        "quiz_id": "q_tit", "answers": [q["answer"] for q in qs],
        "scene_type": "experiment", "scene_code": "chem_titration", "mode": "exam",
    }, headers=student_headers)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["correct"] == 3 and d["total"] == 3 and d["score"] == 100

    # 全错
    wrong = [(q["answer"] + 1) % len(q["options"]) for q in qs]
    r = client.post("/quiz/submit", json={
        "quiz_id": "q_tit", "answers": wrong,
        "scene_type": "experiment", "scene_code": "chem_titration", "mode": "exam",
    }, headers=student_headers)
    d = r.json()["data"]
    assert d["correct"] == 0 and d["score"] == 0


def test_judge_qtype_grading(client, teacher_headers, ts):
    code = f"judge_{ts}"
    txt = f"判断：稀释浓硫酸应将酸慢慢倒入水中_{ts}"
    r = client.post("/quiz/questions", headers=teacher_headers, json={
        "question": txt, "options": [], "qtype": "judge", "answer": 1,
        "scene_type": "experiment", "scene_code": code,
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["qtype"] == "judge"

    qs = client.get("/quiz/questions", params={"scene_code": code},
                    headers=teacher_headers).json()["data"]["questions"]
    assert qs[0]["options"] == ["错误", "正确"]  # 判断固定选项

    # 答对（选"正确"=1）
    r = client.post("/quiz/submit", json={
        "quiz_id": "qj", "answers": [1], "scene_code": code, "mode": "exam",
    }, headers=teacher_headers)
    assert r.json()["data"]["correct"] == 1 and r.json()["data"]["score"] == 100

    # 答错（选"错误"=0）
    r = client.post("/quiz/submit", json={
        "quiz_id": "qj", "answers": [0], "scene_code": code, "mode": "exam",
    }, headers=teacher_headers)
    assert r.json()["data"]["correct"] == 0 and r.json()["data"]["score"] == 0


def test_sequence_qtype_grading(client, teacher_headers, ts):
    code = f"seq_{ts}"
    txt = f"排序：配制一定浓度溶液的正确操作顺序_{ts}"
    # 正确顺序：1,0,2 （溶解->称量->定容）
    r = client.post("/quiz/questions", headers=teacher_headers, json={
        "question": txt, "options": ["溶解", "称量", "定容"],
        "qtype": "sequence", "answer_seq": [1, 0, 2],
        "scene_type": "experiment", "scene_code": code,
    })
    assert r.status_code == 200, r.text
    qm = r.json()["data"]
    assert qm["qtype"] == "sequence"
    assert qm["answer_seq"] == [1, 0, 2]

    qs = client.get("/quiz/questions", params={"scene_code": code},
                    headers=teacher_headers).json()["data"]["questions"]
    assert qs[0]["qtype"] == "sequence" and qs[0]["answer_seq"] == [1, 0, 2]

    # 顺序正确
    r = client.post("/quiz/submit", json={
        "quiz_id": "qs", "answers": [[1, 0, 2]], "scene_code": code, "mode": "exam",
    }, headers=teacher_headers)
    assert r.json()["data"]["correct"] == 1 and r.json()["data"]["score"] == 100

    # 顺序错误
    r = client.post("/quiz/submit", json={
        "quiz_id": "qs", "answers": [[0, 1, 2]], "scene_code": code, "mode": "exam",
    }, headers=teacher_headers)
    assert r.json()["data"]["correct"] == 0 and r.json()["data"]["score"] == 0


def test_open_qtype_practice_grading_with_degrade(client, teacher_headers, ts):
    """开放题练习模式调 Ollama 批改；Ollama 关闭时降级为规则评语，不崩溃。"""
    code = f"open_{ts}"
    txt = f"开放：简述稀释浓硫酸的安全要点_{ts}"
    r = client.post("/quiz/questions", headers=teacher_headers, json={
        "question": txt, "options": [], "qtype": "open",
        "answer_text": "酸入水、缓慢倒入、持续搅拌、佩戴护目镜",
        "scene_type": "experiment", "scene_code": code,
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["qtype"] == "open"

    qs = client.get("/quiz/questions", params={"scene_code": code},
                    headers=teacher_headers).json()["data"]["questions"]
    assert qs[0]["qtype"] == "open"

    # 练习模式：应返回 AI 批改评语且不计分（total=0）
    r = client.post("/quiz/submit", json={
        "quiz_id": "qo", "answers": ["我把浓硫酸慢慢倒进水里并搅拌"],
        "scene_code": code, "mode": "practice",
    }, headers=teacher_headers)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["total"] == 0 and d["score"] == 0  # 开放题不计分
    assert isinstance(d["ai_comments"], list) and len(d["ai_comments"]) == 1
    assert d["ai_comments"][0]["comment"]  # 降级也应有评语文本

    # 正式考核模式：开放题跳过，ai_comments 为空
    r = client.post("/quiz/submit", json={
        "quiz_id": "qo", "answers": ["作答"],
        "scene_code": code, "mode": "exam",
    }, headers=teacher_headers)
    d = r.json()["data"]
    assert d["ai_comments"] == []


def test_mixed_qtype_submit(client, teacher_headers, ts):
    """同场景混合 排序 + 开放 题，练习模式一次提交。"""
    code = f"mix_{ts}"
    client.post("/quiz/questions", headers=teacher_headers, json={
        "question": f"排序混合_{ts}", "options": ["A", "B", "C"],
        "qtype": "sequence", "answer_seq": [2, 1, 0],
        "scene_type": "experiment", "scene_code": code,
    })
    client.post("/quiz/questions", headers=teacher_headers, json={
        "question": f"开放混合_{ts}", "options": [], "qtype": "open",
        "answer_text": "要点参考", "scene_type": "experiment", "scene_code": code,
    })

    qs = client.get("/quiz/questions", params={"scene_code": code},
                    headers=teacher_headers).json()["data"]["questions"]
    assert len(qs) == 2
    # 按返回顺序对齐答案：排序给正确顺序，开放给文本
    answers = []
    for q in qs:
        if q["qtype"] == "sequence":
            answers.append(q["answer_seq"])
        else:
            answers.append("我的作答")
    r = client.post("/quiz/submit", json={
        "quiz_id": "qm", "answers": answers, "scene_code": code, "mode": "practice",
    }, headers=teacher_headers)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["correct"] == 1 and d["total"] == 1  # 仅排序题计分
    assert len(d["ai_comments"]) == 1             # 开放题产生评语
