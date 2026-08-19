"""自测接口：题库、提交判分、错题解析。按场景类型过滤题目。"""
import asyncio
import json
import re
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_current_user_optional, require_roles
from app.database import get_db
from app.models.quiz_question import QuizQuestion
from app.models.quiz_record import QuizRecord
from app.models.user import User
from app.services.profile_service import refresh_profile
from app.services.rag_service import try_ollama_generate_async
from app.utils.response import fail, ok

router = APIRouter(prefix="/quiz", tags=["自测"])

# 内置题库（现已仅支持化学实验场景）
QUIZ_BANK = [
    # ===== 化学实验场景 =====
    {"id": "q1", "scene_type": "experiment", "question": "加热试管时，试管口应朝向哪个方向？",
     "options": ["朝向自己", "朝向他人", "朝向无人区", "任意方向"], "answer": 2,
     "analysis": "试管口朝向人会导致液体喷溅伤人，应朝向无人区。"},
    {"id": "q2", "scene_type": "experiment", "question": "实验结束后，酒精灯应如何处理？",
     "options": ["直接离开", "用嘴吹灭", "盖灭后确认火已熄", "泼水浇灭"], "answer": 2,
     "analysis": "应用灯帽盖灭酒精灯，并确认火焰完全熄灭后离开。"},
    {"id": "q3", "scene_type": "experiment", "question": "酸性废液应如何处理？",
     "options": ["直接倒入下水道", "中和后分类收集", "倒入垃圾桶", "倒回原试剂瓶"], "answer": 1,
     "analysis": "酸性废液必须中和后分类收集，严禁直排下水道。"},
    {"id": "q4", "scene_type": "experiment", "question": "稀释浓硫酸时，正确操作是？",
     "options": ["将水倒入浓硫酸中", "将浓硫酸沿器壁缓慢倒入水中并搅拌", "两者同时倒入", "随意混合"], "answer": 1,
     "analysis": "稀释浓硫酸必须将酸缓慢加入水中并不断搅拌，反之会引起酸液飞溅。"},
    {"id": "q5", "scene_type": "experiment", "question": "闻试剂气味时正确做法是？",
     "options": ["鼻子直接凑近瓶口", "用手在瓶口轻轻扇动闻", "深吸一口", "不需要闻"], "answer": 1,
     "analysis": "应用手在瓶口轻轻扇动，使少量气体飘入鼻孔，严禁直接凑近闻。"},
    {"id": "q6", "scene_type": "experiment", "question": "操作腐蚀性试剂时必须佩戴？",
     "options": ["普通眼镜", "护目镜", "太阳镜", "无需佩戴"], "answer": 1,
     "analysis": "腐蚀性试剂可能飞溅伤眼，必须佩戴符合标准的护目镜。"},
    {"id": "q7", "scene_type": "experiment", "question": "取用试剂后多余的试剂应如何处理？",
     "options": ["倒回原瓶", "丢弃到废液桶", "留在烧杯中", "倒入下水道"], "answer": 1,
     "analysis": "取出的试剂禁止倒回原瓶，应按废液分类处理。"},
    {"id": "q8", "scene_type": "experiment", "question": "使用易燃溶剂（如乙醚、乙醇）时，热源应选择？",
     "options": ["明火酒精灯", "水浴锅间接加热", "电炉直接加热", "任意热源"], "answer": 1,
     "analysis": "易燃溶剂必须用水浴锅等间接加热方式，严禁明火。"},
    {"id": "q9", "scene_type": "experiment", "question": "进入化学实验室的着装要求是？",
     "options": ["穿拖鞋短裤即可", "穿实验服、扎起长发、穿平底鞋", "穿裙子", "无要求"], "answer": 1,
     "analysis": "进入实验室须穿实验服，长发须扎起，穿平底鞋，禁止拖鞋短裤。"},
    {"id": "q10", "scene_type": "experiment", "question": "挥发性有毒试剂应在何处操作？",
     "options": ["实验台上", "通风橱内", "走廊", "任意位置"], "answer": 1,
     "analysis": "挥发性、有毒试剂操作必须在通风橱内进行。"},

    # ===== 酸碱中和滴定场景专属题 =====
    {"id": "qt1", "scene_type": "experiment", "scene_code": "chem_titration",
     "question": "滴定管在用标准液装液前应如何润洗？",
     "options": ["直接用自来水冲完装液", "先用蒸馏水润洗，再用待装标准液润洗", "用待测液润洗", "不润洗"], "answer": 1,
     "analysis": "必须用待装标准液润洗，避免管壁残留水稀释标准液造成系统误差。"},
    {"id": "qt2", "scene_type": "experiment", "scene_code": "chem_titration",
     "question": "酸碱滴定终点应怎样确认？",
     "options": ["颜色一变立刻读数", "由粉红变无色且 30 秒不恢复、平视读数", "滴定管满刻度", "突变后立刻加过量"], "answer": 1,
     "analysis": "颜色稳定 30 秒不返色才是真正终点，读数须平视凹液面。"},
    {"id": "qt3", "scene_type": "experiment", "scene_code": "chem_titration",
     "question": "锥形瓶是否需要用待测液润洗？",
     "options": ["需要", "不需要，用蒸馏水洗即可", "用标准液润洗", "看情况"], "answer": 1,
     "analysis": "用待测液润洗会引入额外溶质，导致结果偏高，只需蒸馏水洗。"},

    # ===== 气体制备与收集场景专属题 =====
    {"id": "qg1", "scene_type": "experiment", "scene_code": "chem_gas_prep",
     "question": "固体加热制气前，检查装置气密性的正确方法？",
     "options": ["手捂试管看气泡、冷却看水柱", "直接点火", "看说明书", "不需检查"], "answer": 0,
     "analysis": "热胀冷缩法：捂热冒泡、冷却回水柱说明不漏气。"},
    {"id": "qg2", "scene_type": "experiment", "scene_code": "chem_gas_prep",
     "question": "固体加热制气时，试管口应？",
     "options": ["向上倾斜", "略向下倾斜（防冷凝水倒流炸裂）", "水平", "朝下"], "answer": 1,
     "analysis": "口略向下倾斜可防止冷凝水倒流至灼热试管底炸裂。"},
    {"id": "qg3", "scene_type": "experiment", "scene_code": "chem_gas_prep",
     "question": "排水法收集完气体，结束实验的顺序？",
     "options": ["先灭灯后撤导管", "先撤导管后灭灯（防倒吸）", "同时", "无所谓"], "answer": 1,
     "analysis": "先撤导管断开水路再灭灯，防止试管冷却负压倒吸炸裂。"},

    # ===== 蒸馏与物质分离场景专属题 =====
    {"id": "qd1", "scene_type": "experiment", "scene_code": "chem_distillation",
     "question": "蒸馏时冷凝管中冷却水的流向？",
     "options": ["上进下出", "下进上出（逆流）", "任意", "不加水"], "answer": 1,
     "analysis": "下进上出形成逆流，换热最充分。"},
    {"id": "qd2", "scene_type": "experiment", "scene_code": "chem_distillation",
     "question": "蒸馏烧瓶中加入碎瓷片（沸石）的作用是？",
     "options": ["好看", "防止暴沸", "加快蒸馏", "染色"], "answer": 1,
     "analysis": "碎瓷片提供汽化中心，防止液体剧烈跳动暴沸冲出。"},
    {"id": "qd3", "scene_type": "experiment", "scene_code": "chem_distillation",
     "question": "蒸馏时温度计水银球应置于？",
     "options": ["液面以下", "蒸馏烧瓶支管口处", "瓶底", "任意"], "answer": 1,
     "analysis": "测蒸出蒸气温度，须对准支管口才能控准馏分沸点。"},

    # ===== 一定物质的量浓度溶液配制场景专属题 =====
    {"id": "qs1", "scene_type": "experiment", "scene_code": "chem_solution_prep",
     "question": "易潮解的 NaOH 称量时应？",
     "options": ["放称量纸上称", "放小烧杯中快速称量", "不用调零", "直接估算"], "answer": 1,
     "analysis": "NaOH 易潮解腐蚀，必须用小烧杯称，且称量前天平调零。"},
    {"id": "qs2", "scene_type": "experiment", "scene_code": "chem_solution_prep",
     "question": "溶解后转移定容前为何要冷却至室温？",
     "options": ["热溶液体积大，冷却后定容体积偏小致浓度偏高", "无所谓", "防止烫伤", "加速溶解"], "answer": 0,
     "analysis": "溶解放热使体积膨胀，热时定容冷却后实际体积不足，浓度偏高。"},
    {"id": "qs3", "scene_type": "experiment", "scene_code": "chem_solution_prep",
     "question": "容量瓶定容时视线应？",
     "options": ["仰视", "平视凹液面最低处与刻度线相切", "俯视", "斜视"], "answer": 1,
     "analysis": "平视凹液面最低处定容，避免视差导致浓度误差。"},
]

# 题目归属：默认 chem_lab；若题目自带 scene_code（如新场景专属题）则保留
for _q in QUIZ_BANK:
    if "scene_code" not in _q:
        _q["scene_code"] = "chem_lab"

# 导入题目的 TXT 模板（易手写格式）
QUIZ_TEMPLATE_TXT = """# 题目1
场景：experiment
题干：使用易燃溶剂时，热源应选择？
选项：明火酒精灯|水浴锅|电炉直接加热|任意热源
答案：1
解析：易燃溶剂必须用水浴锅等间接加热方式，严禁明火。

# 题目2（通用场景，场景字段可省略，默认 general）
题干：操作前应做什么？
选项：直接开工|阅读安全规程|问同事|随便
答案：1
解析：作业前必须熟悉本岗位安全操作规程。
"""


def _parse_txt(raw_text: str) -> list[dict]:
    """解析 TXT 格式题目：用 # 分隔题目，字段用 '字段：值'，选项用 | 分隔。"""
    questions = []
    # 按 # 开头行分割题目块
    blocks = re.split(r"^#\s*", raw_text, flags=re.MULTILINE)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        item = {"scene_type": "general", "question": "", "options": [], "answer": 0, "analysis": ""}
        for line in block.splitlines():
            line = line.strip()
            if not line:
                continue
            # 支持 中英文冒号
            for sep in ("：", ":"):
                if sep in line:
                    key, _, val = line.partition(sep)
                    key = key.strip()
                    val = val.strip()
                    if key in ("场景", "scene_type", "scene"):
                        item["scene_type"] = val
                    elif key in ("题干", "question", "题目"):
                        item["question"] = val
                    elif key in ("选项", "options"):
                        item["options"] = [o.strip() for o in val.split("|") if o.strip()]
                    elif key in ("答案", "answer"):
                        try:
                            item["answer"] = int(val)
                        except ValueError:
                            # 支持填选项文本：答案：水浴锅（保持字符串，由 import 接口匹配）
                            item["answer"] = val
                    elif key in ("解析", "analysis"):
                        item["analysis"] = val
                    break
        # 选项不能为空
        if item["question"] or item["options"]:
            questions.append(item)
    return questions


class QuizSubmit(BaseModel):
    quiz_id: str = "quiz_001"
    answers: list  # 每题答案：choice/judge=int，sequence=list[int]，open=str
    mode: str = "exam"  # exam=正式考核（开放题不计分）；practice=练习（开放题接 Ollama 批改）
    scene_type: str = "experiment"
    scene_code: str = ""


class QuestionUpsert(BaseModel):
    """单题创建/更新载荷（供教师创作台可视化编辑）。
    qtype: choice(单选) | judge(判断) | sequence(操作排序) | open(开放/练习)
    - choice: answer=正确选项索引
    - judge: 选项自动为['错误','正确']，answer=0/1
    - sequence: options=步骤列表，answer_seq=正确顺序（选项索引排列）
    - open: options 可空，answer_text=参考答案（练习模式接 Ollama 批改）
    """
    question: str
    options: list[str] = []
    answer: int = 0
    qtype: str = "choice"
    answer_seq: list[int] = []
    answer_text: str = ""
    analysis: str = ""
    scene_type: str = "general"
    scene_code: str = ""


def _q_to_managed(q: QuizQuestion) -> dict:
    """把 DB 题目转换成创作台可用的（数值 id）字典。"""
    import json as _json
    return {
        "id": q.id,
        "scene_type": q.scene_type,
        "scene_code": q.scene_code or "",
        "question": q.question,
        "options": _json.loads(q.options) if q.options else [],
        "answer": q.answer,
        "qtype": q.qtype or "choice",
        "answer_seq": _json.loads(q.answer_seq) if q.answer_seq else [],
        "answer_text": q.answer_text or "",
        "analysis": q.analysis,
    }


def _validate_question_payload(req: QuestionUpsert):
    if not str(req.question).strip():
        return "题干不能为空"
    qt = (req.qtype or "choice")
    if qt not in ("choice", "judge", "sequence", "open"):
        return "题型不支持"
    if qt == "open":
        if not str(req.answer_text).strip():
            return "开放题必须填写参考答案"
        # 开放题不依赖选项计数
    elif qt == "judge":
        # 判断题固定两个选项，answer 0=错 / 1=对
        if req.answer not in (0, 1):
            return "判断题答案必须是 0(错) 或 1(对)"
    elif qt == "sequence":
        if not isinstance(req.options, list) or len(req.options) < 2:
            return "排序题至少需要 2 个步骤"
        if not isinstance(req.answer_seq, list) or len(req.answer_seq) != len(req.options):
            return "排序题正确顺序长度必须与步骤数一致"
        if sorted(req.answer_seq) != list(range(len(req.options))):
            return "排序题正确顺序必须是 0~n-1 的完整排列"
    else:  # choice
        if not isinstance(req.options, list) or len(req.options) < 2:
            return "选项至少需要 2 个"
        if req.answer < 0 or req.answer >= len(req.options):
            return f"答案索引超出选项范围（0-{len(req.options) - 1}）"
    if req.scene_type not in ("experiment", "general"):
        req.scene_type = "general"
    return None


def _load_imported(db: Session) -> list[dict]:
    """从数据库加载用户导入的题目。"""
    # include_answer_text=True：开放题练习模式需要参考答案供 Ollama 批改
    rows = db.query(QuizQuestion).order_by(QuizQuestion.id).all()
    return [r.to_dict(include_answer_text=True) for r in rows]


def _filter_bank(scene_type: str, db: Session = None, scene_code: str = ""):
    """按场景过滤题目：内置题库 + 导入题目。
    scene_code 优先：指定具体场景（chem_lab 等），取该场景题 + 通用题。
    scene_type 兜底：experiment|general。
    """
    bank = list(QUIZ_BANK)
    if db is not None:
        bank = bank + _load_imported(db)
    # 归一化：内置题缺 qtype/answer_seq/answer_text 字段，补默认值，
    # 保证 /quiz/questions 响应与判分逻辑对内置题/导入题一致。
    bank = [{
        **q,
        "qtype": q.get("qtype", "choice"),
        "answer_seq": q.get("answer_seq", []),
        "answer_text": q.get("answer_text", ""),
    } for q in bank]
    # scene_code 精确过滤优先
    if scene_code:
        primary = [q for q in bank if q.get("scene_code") == scene_code]
        general = [q for q in bank if q.get("scene_code", "") == "" and q["scene_type"] == "general"]
        pool = primary + general
        return pool if pool else bank
    # 兜底：按 scene_type 过滤
    if not scene_type or scene_type == "general":
        return bank
    primary = [q for q in bank if q["scene_type"] == scene_type]
    general = [q for q in bank if q["scene_type"] == "general"]
    pool = primary + general
    return pool if pool else bank


@router.get("/questions")
def questions(
    scene_type: str = Query(default="experiment", description="场景类型过滤：experiment|general"),
    scene_code: str = Query(default="", description="具体场景代码（chem_lab 等），优先于 scene_type"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bank = _filter_bank(scene_type, db, scene_code=scene_code)
    return ok({"quiz_id": "quiz_001", "scene_type": scene_type, "scene_code": scene_code, "questions": bank, "builtin_count": len(QUIZ_BANK)})


async def _grade_open_answer(question: str, ref: str, student: str) -> str:
    """练习模式开放题：调 Ollama 做自然语言批改，失败降级为规则引擎评语。"""
    prompt = (
        "你是化学实验实训的批改助手。请基于参考答案，简要评价学生作答是否抓住关键安全与操作要点。\n"
        f"题干：{question}\n参考答案：{ref}\n学生作答：{student}\n"
        "输出 2~4 句中文：先给结论（合格/基本合格/需加强），再指出关键遗漏或错误。不要给分数。"
    )
    try:
        text = await try_ollama_generate_async(prompt, max_tokens=300)
        return (text or "").strip() or "已提交，请对照参考答案自行核对要点。"
    except Exception:
        return "已提交，AI 批改暂不可用，请对照参考答案自行核对要点。"


@router.post("/submit")
async def submit(req: QuizSubmit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 提交时按当前场景题库校验
    bank = _filter_bank(getattr(req, "scene_type", "experiment"), db, scene_code=getattr(req, "scene_code", ""))
    if len(req.answers) != len(bank):
        return fail(f"答案数量({len(req.answers)})与题目数量({len(bank)})不匹配", code=400)
    mode = (req.mode or "exam").lower()
    correct = 0
    graded_total = 0
    wrong_items = []
    ai_comments = []
    for q, ans in zip(bank, req.answers):
        qt = q.get("qtype", "choice")
        if qt == "open":
            if mode == "practice":
                comment = await _grade_open_answer(q["question"], q.get("answer_text", "") or "", str(ans or ""))
                ai_comments.append({"id": q["id"], "question": q["question"], "comment": comment})
            # 开放题在正式考核中不计入分数
            continue
        graded_total += 1
        if qt == "sequence":
            is_correct = isinstance(ans, list) and list(ans) == list(q.get("answer_seq", []))
            your_text = "→".join(q["options"][i] for i in ans if isinstance(i, int) and 0 <= i < len(q["options"])) or "未作答"
            correct_text = "→".join(q["options"][i] for i in q.get("answer_seq", []) if isinstance(i, int) and 0 <= i < len(q["options"]))
        else:  # choice / judge
            ai = ans if isinstance(ans, int) else -1
            is_correct = ai == q["answer"]
            your_text = q["options"][ai] if 0 <= ai < len(q["options"]) else "未作答"
            correct_text = q["options"][q["answer"]]
        if is_correct:
            correct += 1
        else:
            wrong_items.append({
                "id": q["id"],
                "qtype": qt,
                "question": q["question"],
                "your_answer": your_text,
                "correct_answer": correct_text,
                "analysis": q["analysis"],
            })
    total = graded_total
    score = round(correct / total * 100) if total else 0

    record = QuizRecord(
        user_id=user.id,
        quiz_id=req.quiz_id,
        scene_code=getattr(req, "scene_code", ""),
        score=score,
        total=total,
        correct=correct,
        wrong_items=json.dumps(wrong_items, ensure_ascii=False),
    )
    db.add(record)
    db.commit()
    refresh_profile(db, user.id)
    return ok({
        "record_id": record.id,
        "score": score,
        "total": total,
        "correct": correct,
        "wrong_items": wrong_items,
        "ai_comments": ai_comments,
    }, message="提交成功")


@router.get("/records")
def records(
    scene_code: str = Query(default="", description="按场景代码过滤"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(QuizRecord).filter(QuizRecord.user_id == user.id)
    if scene_code:
        q = q.filter(QuizRecord.scene_code == scene_code)
    items = q.order_by(QuizRecord.id.desc()).limit(20).all()
    return ok([r.to_dict() for r in items])


@router.get("/wrong-book")
def wrong_book(
    scene_code: str = Query(default="", description="按场景代码过滤错题"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """错题本：汇总用户所有考试中的错题，去重后返回。"""
    q = db.query(QuizRecord).filter(QuizRecord.user_id == user.id)
    if scene_code:
        q = q.filter(QuizRecord.scene_code == scene_code)
    records = q.order_by(QuizRecord.id.desc()).limit(30).all()
    # 汇总错题，按题干去重
    seen = {}
    for r in records:
        try:
            items = json.loads(r.wrong_items) if r.wrong_items else []
        except Exception:
            items = []
        for item in items:
            key = item.get("question", "")
            if key and key not in seen:
                seen[key] = {
                    "question": key,
                    "your_answer": item.get("your_answer", ""),
                    "correct_answer": item.get("correct_answer", ""),
                    "analysis": item.get("analysis", ""),
                    "wrong_count": 1,
                    "scene_code": r.scene_code or "",
                    "last_wrong_at": r.created_at.isoformat() if r.created_at else None,
                }
            elif key in seen:
                seen[key]["wrong_count"] += 1
    wrong_list = sorted(seen.values(), key=lambda x: -x["wrong_count"])
    return ok({
        "total": len(wrong_list),
        "items": wrong_list,
        "scene_code": scene_code,
    })


@router.get("/template")
def download_template(
    fmt: str = Query(default="json", description="模板格式：json 或 txt"),
    user: User = Depends(get_current_user_optional),
):
    """下载导入题目模板，支持 JSON 和 TXT 格式。"""
    if fmt == "txt":
        return Response(
            content=QUIZ_TEMPLATE_TXT,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=quiz_template.txt"},
        )
    content = json.dumps(QUIZ_TEMPLATE, ensure_ascii=False, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=quiz_template.json"},
    )


@router.post("/import")
async def import_questions(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """导入题目文件，支持 JSON 和 TXT 格式。

    JSON: [{"scene_type","question","options","answer","analysis"}, ...]
    TXT:  用 # 分隔题目，字段用 '字段：值'，选项用 | 分隔，答案可填索引或选项文本
    """
    raw = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".txt"):
        try:
            text = raw.decode("utf-8-sig")
            data = _parse_txt(text)
        except Exception as e:
            return fail(f"TXT 解析失败：{e}", code=400)
    else:
        try:
            data = json.loads(raw.decode("utf-8-sig"))
        except Exception as e:
            return fail(f"JSON 解析失败：{e}", code=400)

    if not isinstance(data, list):
        return fail("文件内容必须是题目数组（[...]）", code=400)

    added = 0
    errors = []
    for i, item in enumerate(data):
        try:
            question = str(item.get("question", "")).strip()
            options = item.get("options", [])
            qtype = str(item.get("qtype", "choice")).strip() or "choice"
            answer = item.get("answer", 0)
            answer_seq = item.get("answer_seq", [])
            answer_text = str(item.get("answer_text", "")).strip()
            scene_type = str(item.get("scene_type", "general")).strip()
            analysis = str(item.get("analysis", "")).strip()

            if not question:
                errors.append(f"第{i+1}题：题干为空"); continue
            if qtype not in ("choice", "judge", "sequence", "open"):
                errors.append(f"第{i+1}题：题型不支持"); continue

            opt_json = json.dumps(options, ensure_ascii=False)
            ans = 0
            seq_json = ""
            if qtype == "open":
                if not answer_text:
                    errors.append(f"第{i+1}题：开放题必须填 answer_text"); continue
            elif qtype == "judge":
                options = ["错误", "正确"]
                opt_json = json.dumps(options, ensure_ascii=False)
                ans = 1 if int(answer) == 1 else 0
            elif qtype == "sequence":
                if not isinstance(options, list) or len(options) < 2:
                    errors.append(f"第{i+1}题：排序题步骤至少 2 个"); continue
                if not isinstance(answer_seq, list) or sorted(answer_seq) != list(range(len(options))):
                    errors.append(f"第{i+1}题：answer_seq 必须是 0~{len(options)-1} 的完整排列"); continue
                seq_json = json.dumps(answer_seq, ensure_ascii=False)
            else:  # choice
                if not isinstance(options, list) or len(options) < 2:
                    errors.append(f"第{i+1}题：选项至少 2 个"); continue
                if isinstance(answer, str):
                    if answer in options:
                        answer = options.index(answer)
                    else:
                        errors.append(f"第{i+1}题：答案'{answer}'不在选项中"); continue
                else:
                    answer = int(answer)
                if answer < 0 or answer >= len(options):
                    errors.append(f"第{i+1}题：answer 索引越界"); continue
                ans = answer
            if scene_type not in ("experiment", "general"):
                scene_type = "general"

            db.add(QuizQuestion(
                scene_type=scene_type,
                question=question,
                options=opt_json,
                answer=ans,
                qtype=qtype,
                answer_seq=seq_json,
                answer_text=answer_text,
                analysis=analysis,
                created_by=user.id,
            ))
            added += 1
        except Exception as e:
            errors.append(f"第{i+1}题：{e}")

    db.commit()
    return ok({
        "added": added,
        "errors": errors,
        "total_imported": db.query(QuizQuestion).count(),
    }, message=f"成功导入 {added} 题" + (f"，{len(errors)} 题失败" if errors else ""))


@router.get("/imported")
def list_imported(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查看已导入的题目列表。"""
    rows = db.query(QuizQuestion).order_by(QuizQuestion.id.desc()).all()
    return ok({"questions": [r.to_dict() for r in rows], "total": len(rows)})


@router.delete("/imported/{question_id}")
def delete_imported(
    question_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除指定导入题目（仅管理员或创建者）。"""
    row = db.query(QuizQuestion).filter(QuizQuestion.id == question_id).first()
    if not row:
        return fail("题目不存在", code=404)
    if user.role != "admin" and row.created_by != user.id:
        return fail("无权删除他人导入的题目", code=403)
    db.delete(row)
    db.commit()
    return ok({"deleted": question_id}, message="删除成功")


# ===== 教师创作台：单题可视化 CRUD（与批量导入/删除并存）=====
@router.get("/questions/managed")
def list_managed_questions(
    scene_type: str = Query(default="", description="按场景类型过滤：experiment|general"),
    scene_code: str = Query(default="", description="按具体场景代码过滤"),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """创作台题目管理列表（仅教师/管理员）：返回可编辑的数据库题目。"""
    q = db.query(QuizQuestion)
    if scene_type:
        q = q.filter(QuizQuestion.scene_type == scene_type)
    if scene_code:
        q = q.filter(QuizQuestion.scene_code == scene_code)
    rows = q.order_by(QuizQuestion.id.desc()).all()
    return ok({"questions": [_q_to_managed(r) for r in rows], "total": len(rows)})


@router.post("/questions")
def create_question(
    req: QuestionUpsert,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """创作台：新建单题。"""
    err = _validate_question_payload(req)
    if err:
        return fail(err, code=400)
    if db.query(QuizQuestion).filter(
        QuizQuestion.question == req.question.strip(),
        QuizQuestion.scene_code == (req.scene_code or ""),
    ).first():
        return fail("该题干与场景下已存在相同题目", code=400)
    opts = list(req.options)
    if req.qtype == "judge":
        opts = ["错误", "正确"]
        req.answer = 1 if req.answer == 1 else 0
    seq_json = json.dumps(list(req.answer_seq), ensure_ascii=False) if req.qtype == "sequence" else ""
    row = QuizQuestion(
        scene_type=req.scene_type,
        scene_code=req.scene_code or "",
        question=req.question.strip(),
        options=json.dumps(opts, ensure_ascii=False),
        answer=req.answer,
        qtype=req.qtype,
        answer_seq=seq_json,
        answer_text=req.answer_text.strip(),
        analysis=req.analysis.strip(),
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    return ok(_q_to_managed(row), message="题目已创建")


@router.put("/questions/{question_id}")
def update_question(
    question_id: int,
    req: QuestionUpsert,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """创作台：编辑单题。"""
    row = db.query(QuizQuestion).filter(QuizQuestion.id == question_id).first()
    if not row:
        return fail("题目不存在", code=404)
    if user.role != "admin" and row.created_by != user.id:
        return fail("无权编辑他人创建的题目", code=403)
    err = _validate_question_payload(req)
    if err:
        return fail(err, code=400)
    opts = list(req.options)
    if req.qtype == "judge":
        opts = ["错误", "正确"]
        req.answer = 1 if req.answer == 1 else 0
    seq_json = json.dumps(list(req.answer_seq), ensure_ascii=False) if req.qtype == "sequence" else ""
    row.question = req.question.strip()
    row.options = json.dumps(opts, ensure_ascii=False)
    row.answer = req.answer
    row.qtype = req.qtype
    row.answer_seq = seq_json
    row.answer_text = req.answer_text.strip()
    row.analysis = req.analysis.strip()
    row.scene_type = req.scene_type
    row.scene_code = req.scene_code or ""
    db.commit()
    return ok(_q_to_managed(row), message="题目已更新")


@router.delete("/questions/{question_id}")
def delete_question(
    question_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """创作台：删除单题。"""
    row = db.query(QuizQuestion).filter(QuizQuestion.id == question_id).first()
    if not row:
        return fail("题目不存在", code=404)
    if user.role != "admin" and row.created_by != user.id:
        return fail("无权删除他人创建的题目", code=403)
    db.delete(row)
    db.commit()
    return ok({"deleted": question_id}, message="删除成功")

