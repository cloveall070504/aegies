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
    {
        "behavior": "制取气体结束时先熄灭酒精灯，未先撤导管",
        "risk_level": "high",
        "frequency": 6,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "先灭灯会导致装置冷却形成负压，水槽中的水倒吸入灼热试管底部，极易炸裂。应遵循『先撤导管、后灭灯』。",
    },
    {
        "behavior": "加热烧杯中的液体时未垫石棉网",
        "risk_level": "medium",
        "frequency": 10,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "烧杯底部受热不均容易炸裂。加热烧杯、锥形瓶等必须垫石棉网，使受热均匀。",
    },
    {
        "behavior": "直接凑近瓶口闻试剂气味",
        "risk_level": "high",
        "frequency": 11,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "直接凑近闻可能吸入大量有毒/刺激性气体。正确方法是用手在瓶口轻轻扇动，使少量气体飘向鼻孔。",
    },
    {
        "behavior": "将取出的多余试剂倒回原试剂瓶",
        "risk_level": "medium",
        "frequency": 8,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "回倒试剂会污染整瓶药品，可能引发不可预知的反应。多余试剂应倒入指定废液容器或按规定处置。",
    },
    {
        "behavior": "使用标签已模糊不清的试剂瓶",
        "risk_level": "high",
        "frequency": 7,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "标签不清无法确认成分，误用可能造成剧烈反应或中毒。应重新确认或按废弃试剂处理，严禁盲目使用。",
    },
    {
        "behavior": "在普通台面上倾倒挥发性浓盐酸，未在通风橱操作",
        "risk_level": "medium",
        "frequency": 9,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "挥发性、有毒或刺激性试剂必须在通风橱内操作，避免有害气体在室内积聚伤害呼吸系统。",
    },
    {
        "behavior": "蒸馏操作中未加沸石直接加热",
        "risk_level": "high",
        "frequency": 4,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "不加沸石液体易暴沸冲出甚至炸裂烧瓶。蒸馏前必须加入碎瓷片/沸石提供汽化中心，且中途不得补加。",
    },
    {
        "behavior": "容量瓶定容时俯视读数",
        "risk_level": "low",
        "frequency": 6,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "俯视读数会使实际体积偏小、浓度偏高。定容必须平视凹液面最低处与刻度线相切，保证准确。",
    },
    {
        "behavior": "实验结束后未关闭水、电、气源便离开实验室",
        "risk_level": "high",
        "frequency": 5,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "无人值守的明火、通电设备或泄漏的燃气是重大火灾隐患。离开前必须逐一确认水、电、气已关闭。",
    },
    {
        "behavior": "向燃着的酒精灯中添加酒精",
        "risk_level": "high",
        "frequency": 6,
        "status": "approved",
        "source": "seed",
        "scene_type": "chem_lab",
        "analysis": "酒精灯燃烧时添加酒精，易引燃灯内酒精蒸气造成爆燃或火焰喷出伤人。添加酒精必须先熄灭并冷却。",
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
    """内置案例：按行为逐条补缺（已存在的跳过），返回新增条数。"""
    existing = {c.behavior for c in db.query(CaseEntry).all()}
    added = 0
    for item in BUILTIN_CASES:
        if item["behavior"] not in existing:
            db.add(CaseEntry(**item))
            existing.add(item["behavior"])
            added += 1
    db.flush()
    return added


def seed_quiz(db: Session) -> int:
    """内置自测题：按题干逐条补缺（已存在的跳过），返回新增条数。"""
    existing = {q.question for q in db.query(QuizQuestion).all()}
    added = 0
    for item in BUILTIN_QUIZ:
        if item["question"] not in existing:
            db.add(QuizQuestion(**item))
            existing.add(item["question"])
            added += 1
    db.flush()
    return added
