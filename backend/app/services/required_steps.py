"""缺失安全步骤识别（反向 RAG 方案1）。

思路：规则库已定义「做错了会怎样」，本模块反向定义「一份规范操作应包含哪些安全检查点」。
给定学员粘贴的实验步骤/方案，按场景推导「本应覆盖、但文本里没出现」的安全步骤，并提示补齐。

关键约束（守诚实、不吹过头）：
- 这是「清单覆盖度」检查，不是评级。输出一律标注为「建议补充」，不臆造事故后果。
- 仅当某安全检查点的所有关键词在全文都未出现，才判定为「缺失」；命中其一即视为已覆盖。
- 仅对化学领域输入生效；非实验输入直接返回空列表。
- 缺失项按该检查点固有风险定级（与规则库一致：护目镜/气密性/验纯=high 等），
  但这是「建议级别」，不并入风险分。
"""
from typing import List, Dict

# 每个场景的安全检查清单。keyword 命中任一即视为已覆盖该检查点。
REQUIRED_STEPS: Dict[str, List[dict]] = {
    "chem_lab": [
        {"id": "ppe_goggles", "label": "佩戴护目镜", "level": "high",
         "keywords": ["护目镜", "防护镜"], "hint": "操作腐蚀性/挥发性试剂必须戴护目镜或面屏。"},
        {"id": "ppe_coat", "label": "穿实验服、扎好长发", "level": "medium",
         "keywords": ["实验服", "白大褂"], "hint": "进入实验室须穿实验服、长发扎起。"},
        {"id": "ppe_gloves", "label": "佩戴防护手套", "level": "medium",
         "keywords": ["手套"], "hint": "接触有机溶剂等须戴耐腐蚀手套。"},
        {"id": "waste_sort", "label": "废液分类收集至指定容器", "level": "high",
         "keywords": ["废液", "回收", "指定容器", "分类收集"], "hint": "废液须按酸/碱/有机/重金属分类，入指定废液桶。"},
        {"id": "hood", "label": "挥发性/有毒试剂在通风橱内操作", "level": "high",
         "keywords": ["通风橱"], "hint": "挥发性、有毒试剂须在通风橱内或配吸收装置操作。"},
        {"id": "no_food", "label": "实验区禁止饮食饮水", "level": "high",
         "keywords": ["饮食", "喝水", "进食", "餐具"], "hint": "实验区域严禁饮食，防止误食有毒物质。"},
        {"id": "wash", "label": "实验结束洗手", "level": "medium",
         "keywords": ["洗手"], "hint": "离开实验室前用肥皂和流动水彻底洗手。"},
        {"id": "heat_safe", "label": "加热前预热、避免骤冷", "level": "medium",
         "keywords": ["预热", "骤冷", "自然冷却"], "hint": "玻璃仪器加热前均匀预热，热仪器勿骤冷。"},
    ],
    "chem_titration": [
        {"id": "rinse_burette", "label": "滴定管需用待装液润洗", "level": "medium",
         "keywords": ["润洗"], "hint": "滴定管须用待装标准液润洗 2-3 次，防残留水稀释。"},
        {"id": "debubble", "label": "滴定管尖嘴赶尽气泡", "level": "medium",
         "keywords": ["气泡"], "hint": "滴定前尖嘴须排气泡，避免读数偏大。"},
        {"id": "read_flat", "label": "读数时视线与凹液面水平", "level": "medium",
         "keywords": ["俯视", "仰视", "平视", "视线", "凹液面"], "hint": "读数视线与刻度线水平，读取凹液面最低处。"},
        {"id": "standardize", "label": "标准溶液须经标定", "level": "high",
         "keywords": ["标定"], "hint": "标准溶液浓度须经基准物质标定确定。"},
    ],
    "chem_gas_prep": [
        {"id": "airtight", "label": "制气前检查装置气密性", "level": "high",
         "keywords": ["气密"], "hint": "装好装置先查气密性，确认不漏气再加料。"},
        {"id": "ignition_purity", "label": "可燃性气体点燃前验纯", "level": "high",
         "keywords": ["验纯"], "hint": "H2、CO 等可燃性气体点燃前必须验纯。"},
        {"id": "anti_suckback", "label": "排水法结束先移导管后熄灯", "level": "high",
         "keywords": ["倒吸", "移导管", "先熄灯"], "hint": "结束时应先将导管移出水面，再熄灭热源，防倒吸。"},
        {"id": "tailgas", "label": "有毒尾气用吸收装置处理", "level": "high",
         "keywords": ["尾气", "吸收"], "hint": "有毒气体（氯气、硫化氢等）须接吸收装置，杜绝直排。"},
    ],
    "chem_distillation": [
        {"id": "boiling_chip", "label": "蒸馏前加沸石/碎瓷片", "level": "high",
         "keywords": ["沸石", "碎瓷片"], "hint": "蒸馏/回流前须加沸石，防暴沸冲料。"},
        {"id": "condenser_water", "label": "先通冷凝水再加热", "level": "high",
         "keywords": ["冷凝水", "先通水", "通冷凝"], "hint": "须先开通冷凝水并流通，再开始加热。"},
        {"id": "no_dry", "label": "蒸馏不蒸干", "level": "medium",
         "keywords": ["蒸干"], "hint": "蒸馏须留适量残液，不得蒸干以防分解/炸裂。"},
        {"id": "indirect_heat", "label": "易燃液体用水浴/油浴间接加热", "level": "high",
         "keywords": ["水浴", "油浴"], "hint": "易燃液体蒸馏须间接加热，禁明火。"},
    ],
    "chem_solution_prep": [
        {"id": "cool_first", "label": "溶解后冷却至室温再定容", "level": "high",
         "keywords": ["冷却", "室温", "定容"], "hint": "热溶液须冷却至室温再转入容量瓶定容。"},
        {"id": "transfer_wash", "label": "转移时洗涤烧杯和玻璃棒", "level": "medium",
         "keywords": ["洗涤", "洗烧杯", "转移"], "hint": "烧杯与玻璃棒须洗涤 2-3 次，洗液一并转入。"},
        {"id": "check_leak", "label": "容量瓶使用前检漏", "level": "low",
         "keywords": ["检漏", "漏水"], "hint": "容量瓶使用前须检漏，瓶塞须配套。"},
        {"id": "meniscus", "label": "用胶头滴管定容至凹液面相切", "level": "low",
         "keywords": ["胶头滴管", "凹液面", "刻度线"], "hint": "最后用胶头滴管逐滴加至凹液面最低处与刻度相切。"},
    ],
}

# 领域判定（与 agent_service._is_domain_input 同源，避免循环导入此处独立维护最小集）
_DOMAIN_WORDS = (
    "实验", "试剂", "试管", "烧杯", "酒精灯", "加热", "护目镜", "手套", "废液",
    "浓硫酸", "稀释", "通风橱", "实验服", "冰箱", "气瓶", "滴定", "蒸馏", "容量瓶",
    "气体", "验纯", "冷凝", "移液", "定容", "溶液", "酸碱",
)


def _is_domain(text: str) -> bool:
    return any(w in text for w in _DOMAIN_WORDS)


def _infer_scene(text: str, scene_type: str) -> str:
    """从全文推断主场景（复用 rag_service 的场景关键词思路，但独立实现避免循环依赖）。"""
    # 场景优先级：更具体的场景先判定
    scene_kw = {
        "chem_titration": ["滴定", "滴定管", "锥形瓶", "指示剂", "标准溶液", "移液管", "润洗", "终点"],
        "chem_gas_prep": ["气体", "气密", "验纯", "排水法", "倒吸", "集气瓶", "长颈漏斗", "尾气", "电石"],
        "chem_distillation": ["蒸馏", "冷凝管", "沸石", "暴沸", "支管口", "蒸干", "分馏", "馏分"],
        "chem_solution_prep": ["容量瓶", "定容", "物质的量浓度", "配制溶液", "溶液配制", "凹液面", "胶头滴管", "标线", "摇匀"],
    }
    for sid, kws in scene_kw.items():
        if any(k in text for k in kws):
            return sid
    if scene_type in ("experiment", "student"):
        return "chem_lab"
    return "chem_lab"


def detect_missing_steps(text: str, scene_type: str = "") -> List[dict]:
    """检测一份实验步骤/方案中「缺失的安全检查点」。

    返回列表，每项：
    {"id", "label", "level", "hint", "scene"}
    仅当某检查点的所有关键词在全文均未出现才视为缺失。
    非实验领域输入返回空列表。
    """
    if not text or not text.strip():
        return []
    if not _is_domain(text):
        return []
    scene = _infer_scene(text, scene_type)
    steps = REQUIRED_STEPS.get(scene, REQUIRED_STEPS["chem_lab"])
    missing = []
    for st in steps:
        kws = st.get("keywords", [])
        covered = any(k in text for k in kws)
        if not covered:
            missing.append({
                "id": st["id"],
                "label": st["label"],
                "level": st["level"],
                "hint": st["hint"],
                "scene": scene,
            })
    return missing
