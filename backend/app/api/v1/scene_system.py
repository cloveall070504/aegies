"""场景系统 API：场景 CRUD、分步骤模拟、培训考核、培训前后对比报告。

面向化学实验实训场景（学生/实验教师/实训中心管理员），内置化学实验标准流程，并支持自定义化学相关实验/实训流程。
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.database import get_db
from app.models.scene import Scene
from app.models.scene_step import SceneStep
from app.models.training import TrainingRecord
from app.models.user import User
from app.utils.response import fail, ok

router = APIRouter(prefix="/scenes", tags=["场景系统-培训"])

# ===== 内置场景种子数据（启动时写入）=====
BUILTIN_SCENES = [
    {
        "scene_code": "chem_lab",
        "name": "化学实验标准流程",
        "icon": "🧪",
        "category": "experiment",
        "description": "覆盖试管加热、试剂取用、废液处理、酒精灯规范操作等核心实验步骤培训",
        "theme_name": "student",
        "builtin": 1,
    },
    {
        "scene_code": "chem_titration",
        "name": "酸碱中和滴定",
        "icon": "⚗️",
        "category": "experiment",
        "description": "滴定管润洗、装液赶气泡、指示剂终点判断与读数等标准滴定流程，防浓度误差与溅液",
        "theme_name": "student",
        "builtin": 1,
    },
    {
        "scene_code": "chem_gas_prep",
        "name": "气体制备与收集",
        "icon": "🫧",
        "category": "experiment",
        "description": "固体加热制气（O₂ 等）的气密性检查、防倒吸、验满与安全结束顺序",
        "theme_name": "student",
        "builtin": 1,
    },
    {
        "scene_code": "chem_distillation",
        "name": "蒸馏与物质分离",
        "icon": "🔥",
        "category": "experiment",
        "description": "搭建蒸馏装置、冷凝水流向、防暴沸、控温收集馏分等分离提纯操作",
        "theme_name": "student",
        "builtin": 1,
    },
    {
        "scene_code": "chem_solution_prep",
        "name": "一定物质的量浓度溶液配制",
        "icon": "🧫",
        "category": "experiment",
        "description": "天平称量、溶解冷却、转移洗涤、定容摇匀等精确配液流程，防体积误差",
        "theme_name": "student",
        "builtin": 1,
    },
]

# 每个内置场景的步骤（操作模拟）
BUILTIN_STEPS = {
    "chem_lab": [
        {
            "step_order": 1,
            "step_title": "第1步：进入实验室前的PPE准备",
            "step_text": "你即将进入化学实验室，实验桌已备好试剂和玻璃器材，门口 PPE 架上有多种防护用品可选。你会怎么做？",
            "risk_level": "high",
            "options": [
                {"label": "穿实验服+戴护目镜+戴一次性手套，把长发和宽松袖口扎好", "correct": True, "consequence": "", "explanation": "化学腐蚀性试剂+飞溅风险，必须穿戴完整 PPE，长发袖口不扎会碰翻试管。"},
                {"label": "只穿实验服，护目镜戴头顶备着，手套觉得闷先不戴", "correct": False, "consequence": "试剂滴溅到眼睛/手上→灼伤就医；袖口扫翻试管→洒出起火", "explanation": "护目镜和手套是化学实验最基本防护，不能省。"},
                {"label": "不穿实验服，直接穿日常衣服上", "correct": False, "consequence": "试剂腐蚀衣物皮肤，溶剂着火引燃衣物", "explanation": "日常衣物不防腐蚀，必须穿阻燃实验服。"},
            ],
            "step_hint": "想想强酸强碱会不会溅到身上/眼睛上",
        },
        {
            "step_order": 2,
            "step_title": "第2步：取用腐蚀性试剂",
            "step_text": "实验台放着一瓶浓硫酸（标签）和一瓶蒸馏水，需要稀释 20mL 浓硫酸。你会怎么取用和混合？",
            "risk_level": "high",
            "options": [
                {"label": "戴手套，标签朝手心倾倒浓硫酸，沿器壁缓慢倒入水中，边倒边用玻璃棒搅拌", "correct": True, "consequence": "", "explanation": "酸入水+缓慢+持续搅拌，防止局部过热爆沸飞溅。"},
                {"label": "把水倒入浓硫酸里，省事", "correct": False, "consequence": "浓酸遇水剧烈放热爆沸→酸液喷溅→面部灼伤", "explanation": "稀释浓硫酸必须酸入水，绝对不能水入酸！"},
                {"label": "直接用量筒倾倒混合，不用搅拌", "correct": False, "consequence": "局部过热→量筒炸裂→强酸洒出", "explanation": "量筒不耐热，不能在其中稀释；且必须搅拌散热。"},
            ],
            "step_hint": "水的密度比酸小，如果水入酸会浮在表面局部沸腾",
        },
        {
            "step_order": 3,
            "step_title": "第3步：加热试管中的液体",
            "step_text": "试管装了 3/4 容积的反应液，需要酒精灯加热。你会怎么操作？",
            "risk_level": "high",
            "options": [
                {"label": "液体不超过 1/3，管口朝向无人区，先预热再集中加热", "correct": True, "consequence": "", "explanation": "装液过多沸腾会喷溅；朝向人直接伤人；不预热受热不均会炸裂。"},
                {"label": "装 3/4 没关系，快速直接用外焰烧试管底部", "correct": False, "consequence": "液体沸腾喷溅→烫伤；试管受热不均炸裂→碎片伤人", "explanation": "液体超过 1/3 严禁加热；必须先预热再集中。"},
                {"label": "管口对着自己方便观察反应颜色变化", "correct": False, "consequence": "液体喷脸→灼伤/失明", "explanation": "管口绝对不能朝向人，必须朝向无人区。"},
            ],
            "step_hint": "沸腾的液体会像喷泉一样喷出来",
        },
        {
            "step_order": 4,
            "step_title": "第4步：酒精灯处理与实验结束",
            "step_text": "加热完成了，同桌去接电话了，灯还着着，桌上散落了几支试管和废液烧杯。你会先做什么？",
            "risk_level": "medium",
            "options": [
                {"label": "先灯帽盖灭酒精灯，确认火完全熄灭，再处理废液和洗玻璃", "correct": True, "consequence": "", "explanation": "酒精灯是明火危险源，必须优先熄灭，再按流程处理其他。"},
                {"label": "着急赶下一节课，直接把灯放在桌上走人", "correct": False, "consequence": "打翻引燃可燃物→实验室火灾", "explanation": "实验结束熄灭火源是铁律，没人值守时更危险。"},
                {"label": "用嘴对着灯芯吹灭，省时间", "correct": False, "consequence": "回火→酒精灯内燃→炸裂起火", "explanation": "严禁用嘴吹灭酒精灯，必须用灯帽盖灭后再打开盖一次。"},
            ],
            "step_hint": "先处理最危险的——明火",
        },
        {
            "step_order": 5,
            "step_title": "第5步：废液和剩余试剂处理",
            "step_text": "实验做完，烧杯里剩了一些酸性废液和少量未反应完的金属钠。你会怎么收尾？",
            "risk_level": "high",
            "options": [
                {"label": "酸性废液中和至中性→倒入废液桶；剩余金属钠用乙醇逐步淬灭→分类收集；固体废渣入危废桶", "correct": True, "consequence": "", "explanation": "酸碱中和+活性金属乙醇淬灭+分类收集是实验室规范。"},
                {"label": "全倒进下水道冲干净", "correct": False, "consequence": "腐蚀管道→水体污染；金属钠遇水爆炸→炸碎下水口", "explanation": "绝对不能直排下水道，尤其是活性金属遇水爆炸。"},
                {"label": "倒回原试剂瓶节约", "correct": False, "consequence": "污染整瓶试剂→后续实验全部失败/发生反应事故", "explanation": "取出的试剂绝不能倒回原瓶，防止污染母液。"},
            ],
            "step_hint": "钠、钾这些活性金属和水会爆炸",
        },
    ],
    "chem_titration": [
        {
            "step_order": 1,
            "step_title": "第1步：滴定管检查与润洗",
            "step_text": "你准备用酸式滴定管装标准盐酸滴定待测碱液。滴定管刚用自来水冲洗过，下一步怎么做？",
            "risk_level": "medium",
            "options": [
                {"label": "先用蒸馏水润洗 2~3 次，再用待装的标准盐酸润洗 2~3 次后装液", "correct": True, "consequence": "", "explanation": "蒸馏水润洗去残留，标准液润洗避免管壁水稀释标准液造成系统误差。"},
                {"label": "直接用自来水冲完就装标准液，省事", "correct": False, "consequence": "管壁残留水稀释标准液→滴定体积偏大→浓度测定严重偏低", "explanation": "滴定管必须用标准液润洗，绝不能用待测液或自来水润洗。"},
                {"label": "用待测碱液润洗滴定管", "correct": False, "consequence": "管壁残留碱液使标准酸被提前中和→消耗体积偏小→结果失真", "explanation": "用待测液润洗会引入额外溶质，必须用标准液润洗。"},
            ],
            "step_hint": "滴定管要用‘待装的标准液’润洗，不是待测液",
        },
        {
            "step_order": 2,
            "step_title": "第2步：装液、赶气泡与调零",
            "step_text": "标准液已装入酸式滴定管，但尖嘴里有气泡，液面在 0 刻度上方。你会怎么处理？",
            "risk_level": "medium",
            "options": [
                {"label": "排气泡（旋塞快速放液/轻弹尖嘴）至无气泡，调液面到 0 或 0 以下并记录初读数", "correct": True, "consequence": "", "explanation": "气泡占据体积导致读数偏小；从 0 或 0 下开始便于计算消耗体积。"},
                {"label": "有气泡不管，直接从当前液面读数", "correct": False, "consequence": "气泡排出后实际消耗体积被低估→浓度误差", "explanation": "尖嘴气泡必须排尽，否则读数不含真实液量。"},
                {"label": "液面在 0 上方也直接开始滴定", "correct": False, "consequence": "无法读取准确初读数→消耗体积算错", "explanation": "初读数应≤0 刻度或从已知刻度精确记录。"},
            ],
            "step_hint": "尖嘴气泡会让‘读数’比‘实际用掉的液体’多",
        },
        {
            "step_order": 3,
            "step_title": "第3步：加指示剂与滴定操作",
            "step_text": "锥形瓶里是待测碱液，你加入酚酞，开始滴加标准酸。过程中应该怎么操作？",
            "risk_level": "high",
            "options": [
                {"label": "左手控旋塞、右手摇锥形瓶，接近终点时逐滴加并半滴操作，持续摇匀", "correct": True, "consequence": "", "explanation": "边滴边摇使反应均匀；近终点半滴防止过量，是标准操作。"},
                {"label": "一下子倒很多标准液快速到变色为止", "correct": False, "consequence": "局部过量→超过终点→浓度测定偏高且无法挽回", "explanation": "滴定必须缓慢近终点逐滴，严禁猛倒。"},
                {"label": "不摇锥形瓶，只盯着颜色", "correct": False, "consequence": "局部变色误判终点→整瓶未混匀→结果偏差", "explanation": "必须持续摇动使指示剂均匀显色。"},
            ],
            "step_hint": "近终点时要‘逐滴甚至半滴’，并一直摇",
        },
        {
            "step_order": 4,
            "step_title": "第4步：终点判断与读数",
            "step_text": "溶液粉色刚好褪去。你如何确认终点并记录体积？",
            "risk_level": "high",
            "options": [
                {"label": "溶液由粉红变无色、且 30 秒内不恢复，平视刻度线读取终读数", "correct": True, "consequence": "", "explanation": "30s 不恢复才为真正终点；平视避免视差，保证读数准确。"},
                {"label": "一看到变色立刻读数，怕过了", "correct": False, "consequence": "可能未到真正终点→体积偏小→结果偏低", "explanation": "需确认颜色稳定 30s 不返色。"},
                {"label": "仰视读数方便", "correct": False, "consequence": "仰视使读数偏大→消耗体积虚高→浓度偏高", "explanation": "滴定管读数必须平视凹液面最低处。"},
            ],
            "step_hint": "仰视/俯视都会引入读数视差",
        },
    ],
    "chem_gas_prep": [
        {
            "step_order": 1,
            "step_title": "第1步：装置气密性检查",
            "step_text": "你用固体加热（如 KClO₃/MnO₂）制氧气，组装好装置后第一步做什么？",
            "risk_level": "high",
            "options": [
                {"label": "把导管末端浸入水中，双手捂热试管，观察有无气泡；冷却后看是否形成水柱", "correct": True, "consequence": "", "explanation": "利用热胀冷缩检验气密性，是制气前必做步骤。"},
                {"label": "直接点燃酒精灯开始加热", "correct": False, "consequence": "若漏气整套收集不到气体、还浪费药品甚至泄漏有毒气", "explanation": "未查气密性就加热等于盲做，必须先确认不漏气。"},
                {"label": "看说明书就行，不用查", "correct": False, "consequence": "装置微漏难察觉→产气失败或危险", "explanation": "气密性必须实测，不能凭感觉。"},
            ],
            "step_hint": "热胀冷缩：捂热冒泡、冷却回水柱=不漏",
        },
        {
            "step_order": 2,
            "step_title": "第2步：固体药品装入",
            "step_text": "药品是固体混合物，试管口应朝哪个方向固定？",
            "risk_level": "high",
            "options": [
                {"label": "试管口略向下倾斜，药品平铺在试管底部", "correct": True, "consequence": "", "explanation": "固体加热产生冷凝水会沿壁下流，口略向下可防止倒流炸裂试管。"},
                {"label": "试管口向上倾斜，方便加药", "correct": False, "consequence": "冷凝水倒流至灼热的试管底→试管炸裂", "explanation": "固体加热制气试管口必须略向下倾斜。"},
                {"label": "水平固定即可", "correct": False, "consequence": "仍存在冷凝水倒流风险→炸裂", "explanation": "必须明显向下倾斜形成排水坡度。"},
            ],
            "step_hint": "冷凝水倒流是试管炸裂的头号原因",
        },
        {
            "step_order": 3,
            "step_title": "第3步：加热与收集",
            "step_text": "开始加热并用排水法收集气体，何时开始收集、怎么验满？",
            "risk_level": "medium",
            "options": [
                {"label": "先排尽空气（均匀连续气泡）再收集；用带火星木条放瓶口，复燃即满", "correct": True, "consequence": "", "explanation": "初段气体混有空气需弃；氧气助燃，带火星木条复燃验满。"},
                {"label": "一有气泡就收集，省时间", "correct": False, "consequence": "收集到的是空气混合气→气体不纯易隐患", "explanation": "初气泡为装置内空气，须等连续均匀再收。"},
                {"label": "用燃着的木条伸入瓶内验满", "correct": False, "consequence": "木条伸入瓶内会引燃/污染已收集气体", "explanation": "验满应在瓶口，不在瓶内。"},
            ],
            "step_hint": "排水法：连续气泡才收；验满在瓶口",
        },
        {
            "step_order": 4,
            "step_title": "第4步：实验结束顺序",
            "step_text": "气体已收集完，要熄灭酒精灯结束实验，正确顺序是？",
            "risk_level": "high",
            "options": [
                {"label": "先把导管从水槽移出，再熄灭酒精灯", "correct": True, "consequence": "", "explanation": "先撤导管防倒吸：熄灯后试管降温负压会把水吸入炸裂试管。"},
                {"label": "先熄灭酒精灯，过会儿再撤导管", "correct": False, "consequence": "试管冷却负压→水被倒吸入热试管→炸裂", "explanation": "‘先撤导管后灭灯’是制气铁律，防倒吸。"},
                {"label": "同时撤导管和灭灯", "correct": False, "consequence": "仍可能倒吸→炸裂", "explanation": "必须先移导管断开水路再灭灯。"},
            ],
            "step_hint": "先撤导管，后灭灯——防倒吸",
        },
    ],
    "chem_distillation": [
        {
            "step_order": 1,
            "step_title": "第1步：装置搭建与温度计位置",
            "step_text": "你搭建蒸馏装置分离乙醇水溶液，温度计水银球应放在哪里？",
            "risk_level": "high",
            "options": [
                {"label": "水银球上沿与蒸馏烧瓶支管口下沿相平（测蒸气温度）", "correct": True, "consequence": "", "explanation": "温度计测的是蒸出蒸气温度，必须对准支管口才能控准馏分沸点。"},
                {"label": "插到液面以下", "correct": False, "consequence": "测的是液体温度而非蒸气→收集到错误馏分", "explanation": "液面下温度不代表蒸出组分沸点。"},
                {"label": "随便放，能看见就行", "correct": False, "consequence": "无法判断馏分→混蒸", "explanation": "位置直接决定分离纯度。"},
            ],
            "step_hint": "温度计测‘蒸气’，不是‘液体’",
        },
        {
            "step_order": 2,
            "step_title": "第2步：冷凝管与防暴沸",
            "step_text": "冷凝管通水方向和是否加碎瓷片，正确做法是？",
            "risk_level": "high",
            "options": [
                {"label": "冷凝水下进上出（逆流）；加几粒碎瓷片防暴沸", "correct": True, "consequence": "", "explanation": "下进上出换热充分；碎瓷片提供汽化中心防液体剧烈跳动暴沸。"},
                {"label": "上进下出更顺；不用碎瓷片", "correct": False, "consequence": "换热差且易暴沸→液体冲出伤人或着火", "explanation": "必须下进上出并加沸石/碎瓷片。"},
                {"label": "不通冷凝水，靠自然冷却", "correct": False, "consequence": "蒸气外逸→损失且易燃蒸气积聚", "explanation": "蒸馏必须通冷凝水回收馏分。"},
            ],
            "step_hint": "下进上出 + 碎瓷片，两件事都关键",
        },
        {
            "step_order": 3,
            "step_title": "第3步：加热与控温收集",
            "step_text": "开始加热，何时换接收瓶、怎么判断该收哪段？",
            "risk_level": "medium",
            "options": [
                {"label": "先弃低沸点前馏分，待温度稳定在该组分沸点再换洁净瓶收集", "correct": True, "consequence": "", "explanation": "不同沸点分段收集是蒸馏分离核心，需控温稳定。"},
                {"label": "一开始就接瓶一直收到干", "correct": False, "consequence": "各组分混在一起→白蒸，还可能蒸糊结焦", "explanation": "不分段收集失去分离意义。"},
                {"label": "温度越高越好，快点蒸完", "correct": False, "consequence": "高温使高沸点杂质也蒸出→产品不纯", "explanation": "蒸馏要控温而非猛升温。"},
            ],
            "step_hint": "分段、控温、别蒸干",
        },
        {
            "step_order": 4,
            "step_title": "第4步：停止与拆卸",
            "step_text": "蒸馏结束，正确的停火与拆卸顺序是？",
            "risk_level": "medium",
            "options": [
                {"label": "先停加热，继续通冷凝水至冷却，再拆装置并清洗", "correct": True, "consequence": "", "explanation": "停火后保持冷凝防残余蒸气；冷却后拆卸安全。"},
                {"label": "立刻关冷凝水并拆热装置", "correct": False, "consequence": "残余蒸气外逸/烫伤", "explanation": "需等冷却再拆。"},
                {"label": "把馏分倒回原料瓶", "correct": False, "consequence": "污染已分离产品", "explanation": "馏分应单独保存。"},
            ],
            "step_hint": "先停火、后停水、再拆卸",
        },
    ],
    "chem_solution_prep": [
        {
            "step_order": 1,
            "step_title": "第1步：计算与称量",
            "step_text": "你要用固体 NaOH 配制一定物质的量浓度的溶液，称量和取用要注意什么？",
            "risk_level": "high",
            "options": [
                {"label": "天平调零、左物右码，NaOH 放小烧杯中快速称量（防潮解），算准质量", "correct": True, "consequence": "", "explanation": "NaOH 易潮解腐蚀，必须用小烧杯称；左物右码是天平规则。"},
                {"label": "直接把 NaOH 放称量纸上称", "correct": False, "consequence": "NaOH 潮解粘纸、腐蚀称量纸→质量不准且污染", "explanation": "腐蚀性/潮解固体必须用烧杯或表面皿称。"},
                {"label": "不用调零，差不多就行", "correct": False, "consequence": "质量系统性偏差→浓度错误", "explanation": "称量前必须调零。"},
            ],
            "step_hint": "NaOH 潮解，别放纸上",
        },
        {
            "step_order": 2,
            "step_title": "第2步：溶解与冷却",
            "step_text": "称量好的 NaOH 在烧杯里加水溶解，接下来直接转移吗？",
            "risk_level": "medium",
            "options": [
                {"label": "玻璃棒搅拌至完全溶解，冷却至室温后再转移", "correct": True, "consequence": "", "explanation": "溶解放热使溶液体积膨胀，热时定容会导致冷却后体积偏小、浓度偏高。"},
                {"label": "趁热直接倒进容量瓶定容", "correct": False, "consequence": "热溶液体积大→定容冷却后实际体积不足→浓度偏高", "explanation": "必须冷却至室温再定容。"},
                {"label": "不搅拌，等它自己溶", "correct": False, "consequence": "溶解不均→局部浓度异常", "explanation": "需搅拌加速并混匀。"},
            ],
            "step_hint": "热涨冷缩：热定容会‘偏浓’",
        },
        {
            "step_order": 3,
            "step_title": "第3步：转移与洗涤",
            "step_text": "把溶液转入容量瓶，杯壁残留怎么处理？",
            "risk_level": "medium",
            "options": [
                {"label": "玻璃棒引流转移，用蒸馏水洗涤烧杯和玻璃棒 2~3 次，洗液一并转入", "correct": True, "consequence": "", "explanation": "洗涤保证溶质全部转移，否则浓度偏低。"},
                {"label": "直接倒进去，杯里剩点不要了", "correct": False, "consequence": "溶质损失→浓度偏低", "explanation": "必须洗涤并合并洗液。"},
                {"label": "用待测液洗涤烧杯", "correct": False, "consequence": "引入杂质量→浓度错误", "explanation": "只能用蒸馏水洗涤。"},
            ],
            "step_hint": "引流 + 洗涤 2~3 次，洗液全转移",
        },
        {
            "step_order": 4,
            "step_title": "第4步：定容与摇匀",
            "step_text": "液面接近刻度线，最后一步怎么操作？",
            "risk_level": "high",
            "options": [
                {"label": "距刻度 1~2cm 改胶头滴管逐滴加至凹液面最低处与刻度线相切，盖塞颠倒摇匀", "correct": True, "consequence": "", "explanation": "平视定容+颠倒摇匀是标准操作，保证体积准确、浓度均匀。"},
                {"label": "直接倒水到满出来一点", "correct": False, "consequence": "体积超过刻度→浓度偏低且无法挽回", "explanation": "超过刻度线必须重配。"},
                {"label": "仰视让液面到刻度线", "correct": False, "consequence": "仰视使加水量偏多→体积偏大→浓度偏低", "explanation": "定容必须平视凹液面最低处。"},
            ],
            "step_hint": "胶头滴管‘逐滴’+平视相切",
        },
    ],
}

# 允许的内置场景代码集合


# 允许的内置场景代码集合
BUILTIN_CODES = {s["scene_code"] for s in BUILTIN_SCENES}


def _seed_scenes(db: Session):
    """启动时写入内置场景和步骤，并清理废弃的车间/厨房等旧非实验场景。"""

    # 1) 清理：代码不符的旧内置场景 + 名称中含厨房/车间/燃气/用火等非实验场景
    #    （覆盖旧系统遗留的 workshop/kitchen/gas_safety 等各种历史代码）
    deprecated = (
        db.query(Scene)
        .filter(
            ((Scene.builtin == 1) & (~Scene.scene_code.in_(list(BUILTIN_CODES))))
            | (Scene.name.like("%厨房%"))
            | (Scene.name.like("%车间%"))
            | (Scene.name.like("%燃气%"))
            | (Scene.name.like("%用火%"))
            | (Scene.name.like("%吊装%"))
            | (Scene.name.like("%焊接%"))
            | (Scene.scene_code.like("%workshop%"))
            | (Scene.scene_code.like("%kitchen%"))
            | (Scene.scene_code.like("%worker%"))
        )
        .all()
    )
    if deprecated:
        codes = list({s.scene_code for s in deprecated})
        db.query(SceneStep).filter(SceneStep.scene_code.in_(codes)).delete(
            synchronize_session=False
        )
        db.query(TrainingRecord).filter(TrainingRecord.scene_code.in_(codes)).delete(
            synchronize_session=False
        )
        for s in deprecated:
            db.delete(s)
        db.commit()

    # 2) 写入内置场景，同时更新已有内置场景的名称/描述/图标
    builtin_codes = set()
    for raw in BUILTIN_SCENES:
        builtin_codes.add(raw["scene_code"])
        existing = db.query(Scene).filter(Scene.scene_code == raw["scene_code"]).first()
        if existing:
            changed = False
            for k in ("name", "icon", "category", "description", "theme_name"):
                if getattr(existing, k) != raw[k]:
                    setattr(existing, k, raw[k])
                    changed = True
            if changed:
                existing.builtin = 1
        else:
            db.add(Scene(**raw))
    db.commit()

    # 3) 写入内置步骤；已存在步骤按 step_order 同步标题、正文、选项、风险等
    for scene_code, steps in BUILTIN_STEPS.items():
        existing_by_order = {
            s.step_order: s
            for s in db.query(SceneStep).filter(SceneStep.scene_code == scene_code).all()
        }
        for s in steps:
            row = existing_by_order.get(s["step_order"])
            if row:
                changed = False
                for k, v in [
                    ("step_title", s["step_title"]),
                    ("step_text", s["step_text"]),
                    ("options_json", json.dumps(s["options"], ensure_ascii=False)),
                    ("risk_level", s["risk_level"]),
                    ("step_hint", s["step_hint"]),
                ]:
                    if getattr(row, k) != v:
                        setattr(row, k, v)
                        changed = True
            else:
                db.add(SceneStep(
                    scene_code=scene_code,
                    step_order=s["step_order"],
                    step_title=s["step_title"],
                    step_text=s["step_text"],
                    options_json=json.dumps(s["options"], ensure_ascii=False),
                    risk_level=s["risk_level"],
                    step_hint=s["step_hint"],
                ))
    db.commit()


# ===== Pydantic schemas =====
class SceneCreate(BaseModel):
    scene_code: str
    name: str
    icon: str = "📋"
    category: str = "custom"
    description: str = ""
    theme_name: str = "student"


class StepCreate(BaseModel):
    scene_code: str
    step_order: int
    step_title: str
    step_text: str = ""
    options: list[dict]
    risk_level: str = "medium"
    step_hint: str = ""


class SimSubmit(BaseModel):
    """分步骤模拟提交：一个场景每道题选了哪个选项。
    stage: pre（预考，没学过）| sim（学习练习）| post（正式考核）"""
    scene_code: str
    stage: str = "sim"
    choices: list[int]   # 每步骤选的选项索引，按 step_order 顺序对应


# ===== 场景 CRUD =====
@router.get("")
def list_scenes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """场景列表：所有内置+当前用户自定义场景。"""
    rows = db.query(Scene).order_by(Scene.builtin.desc(), Scene.id).all()
    return ok([r.to_dict() for r in rows])


@router.post("")
def create_scene(req: SceneCreate, user: User = Depends(require_roles("teacher", "admin")), db: Session = Depends(get_db)):
    """新建自定义场景。"""
    if db.query(Scene).filter(Scene.scene_code == req.scene_code).first():
        return fail("场景代码已存在", code=400)
    row = Scene(
        scene_code=req.scene_code,
        name=req.name,
        icon=req.icon or "📋",
        category=req.category or "custom",
        description=req.description,
        theme_name=req.theme_name or "student",
        builtin=0,
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    return ok(row.to_dict(), message="场景已创建")


@router.put("/{scene_code}")
def update_scene(scene_code: str, req: SceneCreate, user: User = Depends(require_roles("teacher", "admin")), db: Session = Depends(get_db)):
    row = db.query(Scene).filter(Scene.scene_code == scene_code).first()
    if not row:
        return fail("场景不存在", code=404)
    if row.builtin:
        return fail("内置场景不可编辑", code=400)
    if user.role != "admin" and row.created_by != user.id:
        return fail("无权编辑他人场景", code=403)
    row.name = req.name
    row.icon = req.icon or row.icon
    row.category = req.category or row.category
    row.description = req.description
    row.theme_name = req.theme_name or row.theme_name
    db.commit()
    return ok(row.to_dict(), message="已更新")


@router.delete("/{scene_code}")
def delete_scene(scene_code: str, user: User = Depends(require_roles("teacher", "admin")), db: Session = Depends(get_db)):
    row = db.query(Scene).filter(Scene.scene_code == scene_code).first()
    if not row:
        return fail("场景不存在", code=404)
    if row.builtin:
        return fail("内置场景不可删除", code=400)
    if user.role != "admin" and row.created_by != user.id:
        return fail("无权删除他人场景", code=403)
    db.query(SceneStep).filter(SceneStep.scene_code == scene_code).delete()
    db.query(TrainingRecord).filter(TrainingRecord.scene_code == scene_code).delete()
    db.delete(row)
    db.commit()
    return ok({"deleted": scene_code}, message="场景已删除")


# ===== 步骤 CRUD =====
@router.get("/{scene_code}/steps")
def list_steps(scene_code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """获取某个场景的分步骤模拟题目。"""
    if not db.query(Scene).filter(Scene.scene_code == scene_code).first():
        return fail("场景不存在", code=404)
    steps = db.query(SceneStep).filter(SceneStep.scene_code == scene_code).order_by(SceneStep.step_order).all()
    # 学习/练习阶段：返回全部选项，不告诉哪个正确
    return ok({
        "scene_code": scene_code,
        "steps": [s.to_dict() for s in steps],
    })


def _check_step_edit_perm(scene: Scene, user: User):
    """步骤编辑权限：教师/管理员可编辑；内置场景步骤仅管理员；自定义场景步骤仅创建者或管理员。"""
    if user.role == "admin":
        return None
    if scene.builtin:
        return fail("内置场景步骤仅管理员可编辑", code=403)
    if scene.created_by != user.id:
        return fail("无权编辑他人创建的场景步骤", code=403)
    return None


@router.post("/{scene_code}/steps")
def add_step(req: StepCreate, user: User = Depends(require_roles("teacher", "admin")), db: Session = Depends(get_db)):
    """自定义场景下新增步骤。"""
    scene = db.query(Scene).filter(Scene.scene_code == req.scene_code).first()
    if not scene:
        return fail("场景不存在", code=404)
    denied = _check_step_edit_perm(scene, user)
    if denied:
        return denied
    if not isinstance(req.options, list) or len(req.options) < 2:
        return fail("步骤选项至少需要 2 个", code=400)
    has_correct = any(o.get("correct") for o in req.options)
    if not has_correct:
        return fail("至少要有一个正确选项", code=400)
    row = SceneStep(
        scene_code=req.scene_code,
        step_order=req.step_order,
        step_title=req.step_title,
        step_text=req.step_text,
        options_json=json.dumps(req.options, ensure_ascii=False),
        risk_level=req.risk_level,
        step_hint=req.step_hint,
    )
    db.add(row)
    db.commit()
    return ok(row.to_dict(), message="步骤已添加")


@router.put("/{scene_code}/steps/{step_id}")
def update_step(scene_code: str, step_id: int, req: StepCreate, user: User = Depends(require_roles("teacher", "admin")), db: Session = Depends(get_db)):
    """编辑某个场景下的步骤（全量覆盖）。"""
    scene = db.query(Scene).filter(Scene.scene_code == scene_code).first()
    if not scene:
        return fail("场景不存在", code=404)
    step = db.query(SceneStep).filter(SceneStep.id == step_id, SceneStep.scene_code == scene_code).first()
    if not step:
        return fail("步骤不存在", code=404)
    denied = _check_step_edit_perm(scene, user)
    if denied:
        return denied
    if not isinstance(req.options, list) or len(req.options) < 2:
        return fail("步骤选项至少需要 2 个", code=400)
    if not any(o.get("correct") for o in req.options):
        return fail("至少要有一个正确选项", code=400)
    step.step_order = req.step_order
    step.step_title = req.step_title
    step.step_text = req.step_text
    step.options_json = json.dumps(req.options, ensure_ascii=False)
    step.risk_level = req.risk_level
    step.step_hint = req.step_hint
    db.commit()
    return ok(step.to_dict(), message="步骤已更新")


@router.delete("/{scene_code}/steps/{step_id}")
def delete_step(scene_code: str, step_id: int, user: User = Depends(require_roles("teacher", "admin")), db: Session = Depends(get_db)):
    """删除某个场景下的步骤。"""
    scene = db.query(Scene).filter(Scene.scene_code == scene_code).first()
    if not scene:
        return fail("场景不存在", code=404)
    step = db.query(SceneStep).filter(SceneStep.id == step_id, SceneStep.scene_code == scene_code).first()
    if not step:
        return fail("步骤不存在", code=404)
    denied = _check_step_edit_perm(scene, user)
    if denied:
        return denied
    db.delete(step)
    db.commit()
    return ok({"deleted": step_id}, message="步骤已删除")


# ===== 分步骤模拟提交 + 培训考核 =====
@router.post("/sim/submit")
def sim_submit(req: SimSubmit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """提交分步骤模拟结果：打分+统计错误步骤+写培训记录。"""
    steps = db.query(SceneStep).filter(SceneStep.scene_code == req.scene_code).order_by(SceneStep.step_order).all()
    if not steps:
        return fail("该场景未配置步骤", code=400)
    if len(req.choices) != len(steps):
        return fail(f"步骤数不匹配：需 {len(steps)} 步，提交了 {len(req.choices)} 步", code=400)

    # 打分
    step_details = []
    wrong_ids = []
    high_risk_wrong = 0
    for step, choice in zip(steps, req.choices):
        opts = json.loads(step.options_json)
        if choice < 0 or choice >= len(opts):
            correct = False
            opt = {}
        else:
            opt = opts[choice]
            correct = bool(opt.get("correct"))
        detail = {
            "step_id": step.id,
            "step_title": step.step_title,
            "risk_level": step.risk_level,
            "choice": choice,
            "choice_label": opt.get("label", "") if opt else "",
            "correct": correct,
            "consequence": opt.get("consequence", "") if not correct else "",
            "explanation": opt.get("explanation", "") if correct else opt.get("consequence", ""),
        }
        step_details.append(detail)
        if not correct:
            wrong_ids.append(step.id)
            if step.risk_level == "high":
                high_risk_wrong += 1

    # 评分：正确率 * 100 - 高危答错额外扣分 5/题
    correct_count = sum(1 for d in step_details if d["correct"])
    score = round((correct_count / len(steps)) * 100 - high_risk_wrong * 5, 1)
    score = max(0, score)
    passed = score >= 60

    # 写培训记录
    tr = (db.query(TrainingRecord)
          .filter(TrainingRecord.user_id == user.id, TrainingRecord.scene_code == req.scene_code)
          .order_by(TrainingRecord.id.desc()).first())
    stage = (req.stage or "sim").lower()

    if not tr:
        if stage == "post":
            return fail("请先完成预考再进行考核", code=400)
        tr = TrainingRecord(user_id=user.id, scene_code=req.scene_code, stage="pre")
        db.add(tr)

    if stage == "pre":
        # 预考：第一次做或者还没考过，写 pre 字段
        tr.pre_score = score
        tr.pre_steps = json.dumps(step_details, ensure_ascii=False)
        tr.pre_at = datetime.now(timezone.utc)
        tr.stage = "learning"
    elif stage == "post":
        # 正式考核：必须先完成预考
        if not tr.pre_at:
            return fail("请先完成预考再进行考核", code=400)
        tr.post_score = score
        tr.post_steps = json.dumps(step_details, ensure_ascii=False)
        tr.post_at = datetime.now(timezone.utc)
        if passed and score > (tr.pre_score or 0):
            tr.pass_ = 1
            tr.stage = "done"
        else:
            tr.pass_ = 0
            tr.stage = "learning"
        tr.weakness = json.dumps(wrong_ids, ensure_ascii=False)
    else:  # sim（学习练习）
        tr.sim_count = (tr.sim_count or 0) + 1
        if tr.stage == "done":
            pass  # 已经通过的不回退
        else:
            tr.stage = "learning"
    db.commit()

    return ok({
        "training_record_id": tr.id,
        "scene_code": req.scene_code,
        "stage": req.stage,
        "score": score,
        "passed": passed,
        "correct_count": correct_count,
        "total": len(steps),
        "high_risk_wrong": high_risk_wrong,
        "step_details": step_details,
        "weakness_steps": wrong_ids,
        "next_stage": tr.stage,
    }, message=(f"预考完成，得 {score} 分" if stage == "pre"
                else (f"考核通过：{score} 分，提升 {round(score - (tr.pre_score or 0),1)} 分" if stage == "post" and passed
                      else (f"考核失败：{score} 分，继续学习" if stage == "post" else f"学习练习：{score} 分"))))


# ===== 培训前后对比报告 =====
@router.get("/training/overview")
def training_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """个人培训总览：每个场景的培训进度、培训前后分对比。"""
    scenes = db.query(Scene).order_by(Scene.builtin.desc(), Scene.id).all()
    records = (db.query(TrainingRecord)
               .filter(TrainingRecord.user_id == user.id)
               .order_by(TrainingRecord.scene_code, TrainingRecord.id.desc())
               .all())
    # 每个场景步骤数
    step_rows = (db.query(SceneStep.scene_code, func.count(SceneStep.id))
                 .group_by(SceneStep.scene_code).all())
    step_counts = {code: cnt for code, cnt in step_rows}
    # 每个场景取最新一条记录
    latest_by_scene = {}
    for r in records:
        if r.scene_code not in latest_by_scene:
            latest_by_scene[r.scene_code] = r
    items = []
    for s in scenes:
        tr = latest_by_scene.get(s.scene_code)
        d = s.to_dict(step_count=step_counts.get(s.scene_code, 0))
        if tr:
            d.update(tr.to_dict())
            d["pre_score"] = tr.pre_score if tr.pre_at else None
            d["post_score"] = tr.post_score if tr.post_at else None
            d["improvement"] = round(tr.post_score - tr.pre_score, 1) if (tr.pre_at and tr.post_at) else None
        else:
            d["stage"] = "idle"
            d["pre_score"] = None
            d["post_score"] = None
            d["improvement"] = None
            d["sim_count"] = 0
            d["pass"] = False
        items.append(d)

    # 总体统计
    total = len(scenes)
    started = sum(1 for d in items if d["stage"] != "idle")
    done = sum(1 for d in items if d["stage"] == "done" and d["pass"])
    avg_improvement = round(sum(d["improvement"] for d in items if d["improvement"] is not None and d["pass"]) / max(done, 1), 1)

    return ok({
        "scenes": items,
        "total": total,
        "started": started,
        "done": done,
        "avg_improvement": avg_improvement,
    })


@router.get("/training/{scene_code}/report")
def training_report(scene_code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """单个场景培训报告：预考步骤详情 vs 考核步骤详情，高亮薄弱项。"""
    tr = (db.query(TrainingRecord)
          .filter(TrainingRecord.user_id == user.id, TrainingRecord.scene_code == scene_code)
          .order_by(TrainingRecord.id.desc()).first())
    scene = db.query(Scene).filter(Scene.scene_code == scene_code).first()
    if not scene:
        return fail("场景不存在", code=404)
    if not tr:
        step_cnt = db.query(func.count(SceneStep.id)).filter(SceneStep.scene_code == scene_code).scalar() or 0
        return ok({"scene": scene.to_dict(step_count=step_cnt), "stage": "idle", "pre_steps": [], "post_steps": [], "weakness_steps": []})
    pre_steps = json.loads(tr.pre_steps) if tr.pre_steps else []
    post_steps = json.loads(tr.post_steps) if tr.post_steps else []
    weakness = json.loads(tr.weakness) if tr.weakness else []
    # 匹配步骤名给 weakness_steps 名称
    weakness_names = []
    for ws in weakness:
        stp = db.query(SceneStep).filter(SceneStep.id == ws).first()
        if stp:
            weakness_names.append({"step_id": ws, "step_title": stp.step_title, "risk_level": stp.risk_level})
    step_cnt = db.query(func.count(SceneStep.id)).filter(SceneStep.scene_code == scene_code).scalar() or 0
    return ok({
        "scene": scene.to_dict(step_count=step_cnt),
        "stage": tr.stage,
        "pre_score": tr.pre_score if tr.pre_at else None,
        "post_score": tr.post_score if tr.post_at else None,
        "improvement": round(tr.post_score - tr.pre_score, 1) if (tr.pre_at and tr.post_at) else None,
        "pre_steps": pre_steps,
        "post_steps": post_steps,
        "weakness_steps": weakness_names,
        "sim_count": tr.sim_count,
        "pass": bool(tr.pass_),
        "pre_at": tr.pre_at.isoformat() if tr.pre_at else None,
        "post_at": tr.post_at.isoformat() if tr.post_at else None,
    })
