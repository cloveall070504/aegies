"""内置演示数据：案例库 + 自测题库。

启动时若对应表为空则写入（幂等，重复启动不会重复插入）。
与 risk_points / scenes 的内置策略一致：风险点与场景是 AI 引擎的知识地基，
案例与题目是教师端教学内容，这里预置一批与内置风险点同主题的演示数据，
保证新部署环境开箱即有内容。
"""
from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.models.case_entry import CaseEntry
from app.models.quiz_question import QuizQuestion

# ============ 案例库（与内置风险点/场景同主题） ============
BUILTIN_CASES: list[dict] = [
    {
        "behavior": "稀释浓硫酸时，把水直接倒入浓硫酸中",
        "risk_level": "high",
        "frequency": 12,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "水入酸会剧烈放热，局部沸腾飞溅，轻则灼伤重则毁容。正确做法是『酸入水、缓缓冲、不断搅拌』，并佩戴护目镜。",
    },
    {
        "behavior": "实验前未佩戴护目镜，直接打开浓硫酸试剂瓶",
        "risk_level": "high",
        "frequency": 8,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "腐蚀性试剂一旦飞溅，可直接灼伤角膜、结膜，造成化学性眼灼伤甚至永久性视力损伤。接触腐蚀性/挥发性试剂必须佩戴护目镜或面屏。",
    },
    {
        "behavior": "实验结束后用嘴吹灭酒精灯",
        "risk_level": "high",
        "frequency": 7,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "吹气可能引燃灯内酒精蒸气造成回火，甚至引发酒精灯爆燃。熄灭酒精灯必须使用灯帽，盖灭两次待冷却后再收纳。",
    },
    {
        "behavior": "将实验废液直接倒入水槽",
        "risk_level": "medium",
        "frequency": 15,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "含酸、碱、重金属或有机试剂的废液直接倾倒，会污染水体并腐蚀管道，须分类收集至指定废液容器，按学校规定统一处置。",
    },
    {
        "behavior": "取用试剂后未盖紧试剂瓶塞",
        "risk_level": "medium",
        "frequency": 9,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "瓶塞不盖紧易导致试剂挥发、潮解或交叉污染，影响实验精度；挥发性易燃试剂还会在室内积聚形成隐患。",
    },
    {
        "behavior": "加热试管中的液体时，试管口朝向自己",
        "risk_level": "high",
        "frequency": 5,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "液体暴沸可能喷溅，试管口朝向自己或他人极易造成烫伤。加热时应使试管口斜向上、朝向无人处，且不越过试管容积的 1/3。",
    },
]

# ============ 自测题库（choice / judge / sequence） ============
BUILTIN_QUIZ: list[dict] = [
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "稀释浓硫酸时，正确的操作是？",
        "options": json.dumps(["将水缓慢倒入浓硫酸中", "将浓硫酸沿器壁缓慢倒入水中并不断搅拌", "两者均可", "先混合再加热"], ensure_ascii=False),
        "answer": 1,
        "qtype": "choice",
        "analysis": "酸入水、缓缓冲、不断搅。水入酸会剧烈放热导致飞溅，是典型高危错误。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "实验完毕可以用嘴直接吹灭酒精灯。",
        "options": json.dumps(["正确", "错误"], ensure_ascii=False),
        "answer": 1,
        "qtype": "judge",
        "analysis": "用嘴吹可能引燃灯内酒精蒸气造成回火，必须用灯帽盖灭并盖两次。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "实验台酒精灯倾倒起火，首先应该？",
        "options": json.dumps(["用水泼灭", "用湿抹布或灭火毯盖灭", "用嘴吹灭", "立即奔跑呼救"], ensure_ascii=False),
        "answer": 1,
        "qtype": "choice",
        "analysis": "酒精起火可用湿抹布/灭火毯隔绝空气盖灭；少量酒精不宜用水，避免火势随水流蔓延。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "实验产生的废液可以直接倒入水槽。",
        "options": json.dumps(["正确", "错误"], ensure_ascii=False),
        "answer": 1,
        "qtype": "judge",
        "analysis": "含酸碱、重金属或有机试剂的废液须分类回收至指定容器，直接倾倒会污染环境并腐蚀管道。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "取用浓硫酸时，应当佩戴？",
        "options": json.dumps(["普通近视镜", "护目镜或面屏", "仅佩戴口罩", "仅戴手套即可"], ensure_ascii=False),
        "answer": 1,
        "qtype": "choice",
        "analysis": "接触腐蚀性/挥发性试剂必须佩戴护目镜或面屏，防止飞溅入眼。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "实验结束后，剩余的化学试剂应如何处理？",
        "options": json.dumps(["倒回原试剂瓶", "倒入水槽", "倒入指定废液容器", "留在台面下次再用"], ensure_ascii=False),
        "answer": 2,
        "qtype": "choice",
        "analysis": "剩余试剂不得回倒原瓶（会污染整瓶试剂），应倒入指定废液容器统一处置。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "请排出稀释浓硫酸的正确操作顺序。",
        "options": json.dumps(["在烧杯中量取适量水", "缓慢沿壁倒入浓硫酸", "边倒边不断搅拌散热", "静置冷却后使用"], ensure_ascii=False),
        "answer": 0,
        "qtype": "sequence",
        "answer_seq": json.dumps([0, 1, 2, 3]),
        "analysis": "先水后酸、缓慢倒入、持续搅拌、静置冷却，四步顺序不可颠倒。",
    },
    {
        "scene_type": "chem_lab",
        "scene_code": "chem_lab",
        "question": "加热试管中的液体时，试管口应朝向？",
        "options": json.dumps(["自己", "身边的同学", "无人处（斜向上）", "正下方桌面"], ensure_ascii=False),
        "answer": 2,
        "qtype": "choice",
        "analysis": "液体暴沸会喷溅，试管口应斜向上朝向无人处，液体量不超过试管容积 1/3。",
    },
]


def seed_cases(db: Session) -> int:
    """内置案例（表为空时写入），返回写入条数。"""
    if db.query(CaseEntry).count() > 0:
        return 0
    for item in BUILTIN_CASES:
        db.add(CaseEntry(**item))
    db.flush()
    return len(BUILTIN_CASES)


def seed_quiz(db: Session) -> int:
    """内置自测题（表为空时写入），返回写入条数。"""
    if db.query(QuizQuestion).count() > 0:
        return 0
    for item in BUILTIN_QUIZ:
        db.add(QuizQuestion(**item))
    db.flush()
    return len(BUILTIN_QUIZ)
