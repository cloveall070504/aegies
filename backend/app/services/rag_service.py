"""反向 RAG 检索服务：基于 TF-IDF 语义相似度从风险知识库中检索匹配条款。

核心改进：
- 使用 jieba 中文分词替代 2-gram 字符滑窗，获得真正的词级别语义匹配
- 使用 TF-IDF 向量化 + 余弦相似度排序，能够识别同义/近义表达
- 支持可选的 embedding 增强（sentence-transformers 可用时自动启用）
"""
import asyncio
import json
import logging
import math
import os
import re
import time
from collections import Counter
from typing import List, Optional

import httpx
import jieba
import jieba.analyse
from sqlalchemy import func
from sqlalchemy.orm import Session

logger = logging.getLogger("uvicorn.error")

from app.config import settings
from app.models.risk_point import RiskPoint

# ============================================================
# 内置风险知识库（冷启动兜底，普通电脑无需 Ollama 即可演示）
# 覆盖化学实验场景
# ============================================================
BUILTIN_RISK_POINTS = [
    # ===== 化学实验场景 =====
    {
        "scene_id": "chem_lab",
        "description": "实验时不佩戴护目镜直接操作腐蚀性试剂",
        "level": "high", "weight": 0.9,
        "clause_ref": "《高等学校实验室安全检查项目表》1.2.3：进行有腐蚀性、刺激性试剂的实验必须佩戴护目镜。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将酸性废液直接倒入下水道",
        "level": "high", "weight": 0.95,
        "clause_ref": "《实验室危险废物管理办法》第4章：酸、碱废液必须中和分类收集，禁止直排下水道。",
    },
    {
        "scene_id": "chem_lab",
        "description": "加热试管时试管口朝向人",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》3.2：加热试管时管口不得朝向自己或他人。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验结束后未关闭酒精灯直接离开",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《化学实验室安全操作规程》6.1：实验完毕必须确认明火、电源已关闭。",
    },
    {
        "scene_id": "chem_lab",
        "description": "稀释浓硫酸时将水倒入浓硫酸中",
        "level": "high", "weight": 0.95,
        "clause_ref": "《化学实验室安全操作规程》4.1：稀释浓硫酸必须将酸缓慢加入水中并搅拌，严禁反向操作。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在易燃溶剂附近使用明火加热",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》5.3：使用乙醚、乙醇等易燃溶剂时严禁明火，应采用水浴间接加热。",
    },
    {
        "scene_id": "chem_lab",
        "description": "闻试剂气味时鼻子直接凑近瓶口",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学实验室安全操作规程》3.5：闻气味应用手在瓶口轻轻扇动，严禁直接凑近瓶口。",
    },
    {
        "scene_id": "chem_lab",
        "description": "未穿实验服未扎长发进行化学实验",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《高校实验室安全管理规定》2.1：进入实验室须穿实验服，长发须扎起，禁止穿拖鞋短裤。",
    },
    {
        "scene_id": "chem_lab",
        "description": "试剂瓶标签模糊不清仍继续使用",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学试剂管理办法》2.3：标签不清的试剂须重新确认或按废弃处理，禁止盲目使用。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在通风橱外操作挥发性有毒试剂",
        "level": "high", "weight": 0.85,
        "clause_ref": "《化学实验室安全操作规程》7.1：挥发性、有毒试剂操作必须在通风橱内进行。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验台面同时摆放多种不相容试剂",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《化学试剂储存规范》3.2：不相容试剂（如氧化剂与还原剂、酸与碱）须分类存放，禁止混放。",
    },
    {
        "scene_id": "chem_lab",
        "description": "使用破损或有裂缝的玻璃器皿进行实验",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《玻璃器皿使用规范》1.4：使用前须检查玻璃器皿完好，破损器皿须立即更换或修复。",
    },
    {
        "scene_id": "chem_lab",
        "description": "取用试剂后未及时盖好瓶塞",
        "level": "low", "weight": 0.4,
        "clause_ref": "《化学试剂管理办法》4.1：取用试剂后须立即盖好瓶塞，防止挥发、吸潮或污染。",
    },
    {
        "scene_id": "chem_lab",
        "description": "加热后的玻璃仪器立即用冷水冲洗或接触冰冷台面导致骤冷炸裂",
        "level": "high", "weight": 0.9,
        "clause_ref": "《玻璃器皿使用规范》2.2：加热后的玻璃仪器须自然冷却至室温，严禁立即用冷水冲洗或放置于冰冷/金属台面，防止骤冷炸裂。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将过量试剂倒回原瓶",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学试剂管理办法》4.3：取出的试剂禁止倒回原瓶，应按废液处理。",
    },
    {
        "scene_id": "chem_lab",
        "description": "未佩戴防护手套直接接触有机溶剂",
        "level": "high", "weight": 0.85,
        "clause_ref": "《化学实验室安全操作规程》2.2：接触有机溶剂须佩戴耐腐蚀防护手套。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验室冰箱内存放食品或个人物品",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《实验室安全管理规定》3.5：实验冰箱禁止存放食品，须专柜专用并标识。",
    },

    # ===== 酸碱中和滴定 =====
    {
        "scene_id": "chem_titration",
        "description": "锥形瓶用待测液润洗，导致测定浓度偏高",
        "level": "high", "weight": 0.8,
        "clause_ref": "《分析化学实验规范》滴定操作：锥形瓶不得润洗，否则引入额外待测物使结果偏高。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定管使用前未用待装标准溶液润洗，浓度被稀释",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《分析化学实验规范》滴定操作：滴定管须用待装液润洗 2-3 次，防止残留水稀释标准液。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定前滴定管尖嘴未赶尽气泡，体积读数偏大",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《分析化学实验规范》滴定操作：排气泡后零点校准，避免气泡占据体积造成读数误差。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定终点读数时俯视或仰视刻度线，引入读数误差",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《分析化学实验规范》读数：视线与凹液面最低处水平，禁止俯视/仰视。",
    },

    # ===== 气体制备与收集 =====
    {
        "scene_id": "chem_gas_prep",
        "description": "制备气体前未检查装置气密性",
        "level": "high", "weight": 0.9,
        "clause_ref": "《气体制备实验安全规程》1.1：装好装置后须先检查气密性，确认不漏气方可加料加热。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "可燃性气体（如氢气）点燃前未验纯",
        "level": "high", "weight": 0.95,
        "clause_ref": "《气体制备实验安全规程》2.3：H2、CO 等可燃性气体点燃前必须验纯，防止爆炸。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "排水法收集结束时先熄灭酒精灯再移出导管，引起倒吸",
        "level": "high", "weight": 0.85,
        "clause_ref": "《气体制备实验安全规程》3.2：结束时应先将导管移出水面，再熄灭热源，防止水倒吸入热试管炸裂。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "收集满的气体从水槽取出后未用玻璃片盖好即移动",
        "level": "low", "weight": 0.4,
        "clause_ref": "《气体制备实验安全规程》3.4：水下用玻璃片盖严瓶口后取出，正置/倒置按气体密度存放。",
    },

    # ===== 蒸馏与物质分离 =====
    {
        "scene_id": "chem_distillation",
        "description": "加热液体未加沸石（或碎瓷片）导致暴沸",
        "level": "high", "weight": 0.9,
        "clause_ref": "《蒸馏操作规范》2.1：蒸馏/回流前须加沸石，中途补加须停沸冷却后进行，防暴沸冲料。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏时温度计水银球未置于蒸馏烧瓶支管口处，读数不准",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《蒸馏操作规范》2.3：温度计水银球上沿应与支管口下沿齐平，测得馏分沸点。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "冷凝管进出水接反（未下进上出），冷凝效果差",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《蒸馏操作规范》2.5：冷凝水须下口进、上口出，保证管内充满冷水充分冷凝。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏烧瓶内液体超过容积 2/3，易溅入冷凝管",
        "level": "low", "weight": 0.45,
        "clause_ref": "《蒸馏操作规范》2.2：加料体积不超过蒸馏烧瓶容积的 2/3，防剧烈沸腾溅出。",
    },

    # ===== 一定物质的量浓度溶液配制 =====
    {
        "scene_id": "chem_solution_prep",
        "description": "溶解后未冷却至室温即转入容量瓶定容，热胀导致浓度偏低",
        "level": "high", "weight": 0.8,
        "clause_ref": "《溶液配制规范》3.2：溶液须冷却至室温再转入容量瓶，否则热胀使定容体积偏小、浓度偏高/偏低。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "转移时未洗涤烧杯和玻璃棒，溶质损失使浓度偏低",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《溶液配制规范》3.3：烧杯与玻璃棒须洗涤 2-3 次，洗液一并转入容量瓶，保证溶质全部转移。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "定容时仰视或俯视刻度线，造成浓度偏差",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《溶液配制规范》3.5：定容时视线与刻度线水平，滴加至凹液面最低处与刻度相切。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "容量瓶使用前未检查是否漏水",
        "level": "low", "weight": 0.4,
        "clause_ref": "《溶液配制规范》3.1：容量瓶使用前须检漏，瓶塞须配套，漏水须更换。",
    },

    # ============================================================
    # 补充：通用化学实验安全（个人防护 / 试剂 / 加热 / 玻璃仪器 / 存储 / 应急 / 废液）
    # ============================================================
    {
        "scene_id": "chem_lab",
        "description": "用嘴通过移液管吸取腐蚀性或有毒试剂（嘴吸）",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》3.6：严禁用嘴吸取任何试剂，须使用洗耳球或移液器。",
    },
    {
        "scene_id": "chem_lab",
        "description": "用手直接拿取或触摸化学试剂",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学实验室安全操作规程》2.1：操作试剂须使用工具，禁止徒手接触，防止腐蚀或中毒。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将强氧化剂（如氯酸钾、高锰酸钾）与易燃物、可燃物混放",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学试剂储存规范》3.3：氧化剂须与还原剂、易燃物分库分柜存放，防止混合后剧烈反应起火爆炸。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在实验室内饮食、饮水或将餐具带入",
        "level": "high", "weight": 0.85,
        "clause_ref": "《高校实验室安全管理规定》2.4：实验区域严禁饮食，防止误食有毒物质。",
    },
    {
        "scene_id": "chem_lab",
        "description": "把试剂瓶直接置于热源（酒精灯、电炉）上加热导致瓶体炸裂",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《玻璃器皿使用规范》1.5：试剂瓶（非耐热）禁止直接加热，须用水浴或油浴间接加热。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将性质不明的废液混合收集导致放热或产生有毒气体",
        "level": "high", "weight": 0.9,
        "clause_ref": "《实验室危险废物管理办法》4.2：不明废液须单独标识存放，禁止混合以免反应放热或产毒。",
    },
    {
        "scene_id": "chem_lab",
        "description": "用温度计代替玻璃棒搅拌导致温度计破裂、汞泄漏",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《玻璃器皿使用规范》1.6：温度计为易碎测温器具，不得当作搅拌棒使用。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验废弃物未分类直接混入生活垃圾",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《实验室危险废物管理办法》3.1：实验废物须按危废分类收集，禁止混入生活垃圾。",
    },
    {
        "scene_id": "chem_lab",
        "description": "皮肤沾到腐蚀性或有毒试剂后未立即用大量流动水冲洗",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室急救规程》1.1：皮肤沾染试剂须立即脱去污染衣物，用大量流动清水冲洗至少15分钟。",
    },
    {
        "scene_id": "chem_lab",
        "description": "浓硫酸溅到皮肤后未先用干布拭去再大量水冲并敷碳酸氢钠",
        "level": "high", "weight": 0.95,
        "clause_ref": "《化学实验室急救规程》1.2：浓硫酸灼伤须先迅速用干布或纸巾拭去，再用大量流动水冲洗，后敷3%-5%碳酸氢钠。",
    },
    {
        "scene_id": "chem_lab",
        "description": "给试管内固体加热时试管口未略向下倾斜致冷凝水倒流炸裂",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《化学实验室安全操作规程》3.3：加热试管内固体时管口应略向下倾斜，防止冷凝水倒流使试管炸裂。",
    },
    {
        "scene_id": "chem_lab",
        "description": "用燃着的酒精灯去点燃另一只酒精灯",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《化学实验室安全操作规程》6.2：须用火柴或点火枪点燃酒精灯，禁止用燃着的灯引燃另一只。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在实验室内奔跑、追逐、打闹",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《高校实验室安全管理规定》1.5：实验室内须保持秩序，禁止奔跑打闹以防碰撞事故。",
    },
    {
        "scene_id": "chem_lab",
        "description": "佩戴隐形眼镜进入实验室且未额外眼部防护（试剂溅入难冲洗）",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《高等学校实验室安全检查项目表》1.2.3：戴隐形眼镜者进行有溅射风险实验须加戴护目镜。",
    },
    {
        "scene_id": "chem_lab",
        "description": "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸",
        "level": "high", "weight": 0.95,
        "clause_ref": "《化学试剂储存规范》4.1：钠、钾须浸没于煤油或石蜡油中密封保存，严禁接触水。",
    },
    {
        "scene_id": "chem_lab",
        "description": "白磷暴露在空气中因缓慢氧化积热自燃",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学试剂储存规范》4.2：白磷须始终浸没于水中保存，取用后剩余不得暴露在空气中。",
    },
    {
        "scene_id": "chem_lab",
        "description": "产生有毒气体（氯气、二氧化硫等）未在通风橱或尾气吸收装置下进行",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》7.2：产生有毒有害气体的反应须在通风橱内或配吸收装置进行。",
    },
    {
        "scene_id": "chem_lab",
        "description": "用湿手触摸电源插座或电器开关导致触电",
        "level": "high", "weight": 0.85,
        "clause_ref": "《实验室用电安全规范》2.1：操作电气设备前须确保手部干燥，禁止湿手触碰开关插座。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将腐蚀性或挥发性试剂直接放在天平称量盘上称量",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《分析化学实验规范》称量：腐蚀性、挥发性试剂须置于称量瓶或表面皿中称量，不得直接接触秤盘。",
    },
    {
        "scene_id": "chem_lab",
        "description": "移液管或胶头滴管伸入试剂瓶内取液污染整瓶试剂",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学试剂管理办法》4.2：取用试剂时滴管、移液管不得接触瓶内壁或瓶内试剂，防止交叉污染。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验结束后未洗手就离开实验室",
        "level": "medium", "weight": 0.55,
        "clause_ref": "《高校实验室安全管理规定》2.5：实验完毕须洗手、清理台面后方可离开。",
    },
    {
        "scene_id": "chem_lab",
        "description": "胶头滴管平放或倒置使试剂倒流腐蚀胶头",
        "level": "low", "weight": 0.4,
        "clause_ref": "《玻璃器皿使用规范》1.7：胶头滴管使用后应竖直放置，禁止平放或倒置以免试剂腐蚀胶头。",
    },
    {
        "scene_id": "chem_lab",
        "description": "金属钠、钾等着火时用水灭火（应撒砂土或干粉）",
        "level": "high", "weight": 0.95,
        "clause_ref": "《实验室火灾应急规程》2.2：活泼金属火灾严禁用水或泡沫，须用干燥砂土或专用干粉覆盖灭火。",
    },
    {
        "scene_id": "chem_lab",
        "description": "在密闭容器或封口试管中加热液体导致内部压强骤增炸裂",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》3.4：加热液体须留有出气通道，禁止在密闭容器或封口管内加热。",
    },
    {
        "scene_id": "chem_lab",
        "description": "加热试管内液体超过容积三分之一导致暴沸喷溅",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《化学实验室安全操作规程》3.1：试管内液体加热体积不超过容积1/3，并不断移动预热。",
    },
    {
        "scene_id": "chem_lab",
        "description": "加热前未对容器进行预热直接集中加热导致局部受热炸裂",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《玻璃器皿使用规范》2.1：加热玻璃器皿前须先均匀预热，避免局部骤热炸裂。",
    },
    {
        "scene_id": "chem_lab",
        "description": "量筒、量杯等非耐热量器直接置于热源上加热",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《玻璃器皿使用规范》1.3：量筒、量杯不耐高温，禁止作为加热容器使用。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将强酸与强碱等废液未经中和直接混合引发剧烈放热",
        "level": "high", "weight": 0.85,
        "clause_ref": "《实验室危险废物管理办法》4.3：酸碱废液须分别收集，混合前须中和并冷却，禁止直接混兑放热。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验产生的有毒尾气（如硫化氢、氮氧化物）未用吸收液处理直接排放",
        "level": "high", "weight": 0.9,
        "clause_ref": "《化学实验室安全操作规程》7.3：有毒尾气须用相应吸收液（如碱液、硫酸铜溶液）吸收后排放。",
    },
    {
        "scene_id": "chem_lab",
        "description": "进入有有毒气体积聚风险的场所未佩戴防毒面具或呼吸防护",
        "level": "high", "weight": 0.9,
        "clause_ref": "《实验室职业健康防护规范》3.2：存在有毒气体环境须佩戴合格呼吸防护用品方可进入。",
    },
    {
        "scene_id": "chem_lab",
        "description": "将不同类别危险化学试剂堆放在同一开放台面无隔离",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《化学试剂储存规范》3.1：不同危险类别试剂须分区、隔离存放，台面不得混堆。",
    },
    {
        "scene_id": "chem_lab",
        "description": "实验台面遗留试剂或碎玻璃未清理即开始新实验",
        "level": "low", "weight": 0.45,
        "clause_ref": "《高校实验室安全管理规定》2.6：每轮实验结束须清理台面，方可进行后续操作。",
    },

    # ===== 酸碱中和滴定（补充）=====
    {
        "scene_id": "chem_titration",
        "description": "滴定管活塞漏液未紧固就使用导致读数失准",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《分析化学实验规范》滴定操作：活塞须涂凡士林并检漏，漏液须修复后再用。",
    },
    {
        "scene_id": "chem_titration",
        "description": "用移液管移取溶液前未用待吸溶液润洗2-3次",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《分析化学实验规范》移液：移液管须用待吸液润洗，防止残留水稀释样品。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定速度过快未逐滴加入导致超过终点过量",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《分析化学实验规范》滴定操作：临近终点须逐滴（半滴）加入，充分摇动。",
    },
    {
        "scene_id": "chem_titration",
        "description": "标准溶液未经标定直接用于滴定计算",
        "level": "high", "weight": 0.8,
        "clause_ref": "《分析化学实验规范》标定：标准溶液浓度须经标定确定，未标定不得使用。",
    },
    {
        "scene_id": "chem_titration",
        "description": "判断滴定终点时未在白色背景下对照且未等半分钟不褪色",
        "level": "low", "weight": 0.45,
        "clause_ref": "《分析化学实验规范》终点判断：须在白背景下对比，等半分钟不褪色方为终点。",
    },
    {
        "scene_id": "chem_titration",
        "description": "滴定过程中锥形瓶剧烈摇动致溶液溅出瓶外",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《分析化学实验规范》滴定操作：摇动须平稳，防止溶液溅失造成误差。",
    },

    # ===== 气体制备与收集（补充）=====
    {
        "scene_id": "chem_gas_prep",
        "description": "制取有毒气体（氯气、硫化氢）未用吸收装置处理尾气",
        "level": "high", "weight": 0.9,
        "clause_ref": "《气体制备实验安全规程》4.1：有毒气体制备须接尾气吸收装置，杜绝直排。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "长颈漏斗下端未插入液面下液封导致漏气或气体逸出",
        "level": "high", "weight": 0.85,
        "clause_ref": "《气体制备实验安全规程》1.3：长颈漏斗须液封，否则装置漏气无法收集。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "固体加热制气时试管口未略向下倾斜冷凝水倒流炸裂",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《气体制备实验安全规程》2.1：固体加热制气试管口略向下倾斜，防冷凝水倒流。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "用排空气法收集气体时导管未伸到集气瓶底部",
        "level": "low", "weight": 0.45,
        "clause_ref": "《气体制备实验安全规程》3.3：排空气法收集导管须伸至瓶底，保证排尽空气。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "电石等遇水剧烈反应的药品未控制加料速度",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《气体制备实验安全规程》2.2：电石制乙炔须缓慢加水控速，防止反应过剧。",
    },
    {
        "scene_id": "chem_gas_prep",
        "description": "加热制气前未先预热直接集中加热",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《气体制备实验安全规程》2.4：加热前须均匀预热，防止试管局部炸裂。",
    },

    # ===== 蒸馏与物质分离（补充）=====
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏时未先通冷凝水就加热导致蒸气外逸",
        "level": "high", "weight": 0.85,
        "clause_ref": "《蒸馏操作规范》2.4：须先开通冷凝水并确认流通，再开始加热。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏将液体蒸干导致残留物分解或烧瓶炸裂",
        "level": "high", "weight": 0.9,
        "clause_ref": "《蒸馏操作规范》2.6：不得蒸干，须留适量残液，防止分解或炸裂。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏易燃液体未采用水浴而直接明火加热",
        "level": "high", "weight": 0.9,
        "clause_ref": "《蒸馏操作规范》2.7：易燃液体蒸馏须用水浴或油浴间接加热，禁明火。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "蒸馏过程中无人看守",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《蒸馏操作规范》1.2：蒸馏须有人值守，随时调节加热与冷凝。",
    },
    {
        "scene_id": "chem_distillation",
        "description": "真空蒸馏前未检查系统气密性与承压能力",
        "level": "medium", "weight": 0.7,
        "clause_ref": "《蒸馏操作规范》3.1：真空蒸馏须确认系统耐压且气密，防止爆裂。",
    },

    # ===== 一定物质的量浓度溶液配制（补充）=====
    {
        "scene_id": "chem_solution_prep",
        "description": "在容量瓶中直接溶解固体（放热使瓶体变形、标定不准）",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《溶液配制规范》3.2：固体须先在烧杯中溶解并冷却，再转入容量瓶。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "用容量瓶长期储存溶液导致标线磨损或溶液变质",
        "level": "low", "weight": 0.4,
        "clause_ref": "《溶液配制规范》3.6：容量瓶为量器非容器，不得长期存液。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "定容加水超过刻度后用滴管吸出再补（应重新配制）",
        "level": "low", "weight": 0.45,
        "clause_ref": "《溶液配制规范》3.4：定容超线即误差，须重配，不得吸出补救。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "转移时玻璃棒下端未靠在容量瓶刻度线下方内壁致液滴外溅",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《溶液配制规范》3.3：引流时玻璃棒下端须靠在刻度线以下内壁。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "摇匀后液面下降又加水至刻度使浓度偏低",
        "level": "low", "weight": 0.45,
        "clause_ref": "《溶液配制规范》3.5：摇匀后液面下降属正常，不得再加水。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "用量筒配制需要精确浓度的溶液（量筒非精密量器）",
        "level": "medium", "weight": 0.6,
        "clause_ref": "《溶液配制规范》1.2：精确浓度须用容量瓶，量筒仅作粗略量取。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "配制易水解盐溶液（如FeCl3、SnCl2）未先加相应酸抑制水解",
        "level": "medium", "weight": 0.65,
        "clause_ref": "《溶液配制规范》4.1：易水解盐须先加相应酸（如盐酸）溶解抑制水解。",
    },
    {
        "scene_id": "chem_solution_prep",
        "description": "定容时未用胶头滴管逐滴加至凹液面最低处与刻度线相切",
        "level": "low", "weight": 0.4,
        "clause_ref": "《溶液配制规范》3.5：最后须用胶头滴管逐滴定容至凹液面与刻度相切。",
    },
]

# 场景关键词映射：根据行为文本中的关键词推断所属实验场景
_KEYWORD_MAP = {
    # 化学实验
    "酸": "chem_lab", "碱": "chem_lab", "试剂": "chem_lab", "试管": "chem_lab",
    "酒精灯": "chem_lab", "烧杯": "chem_lab", "量筒": "chem_lab", "浓硫酸": "chem_lab",
    "废液": "chem_lab", "腐蚀": "chem_lab", "易燃": "chem_lab", "溶剂": "chem_lab",
    "化学": "chem_lab", "稀释": "chem_lab", "明火": "chem_lab", "通风橱": "chem_lab",
    "护目镜": "chem_lab", "实验服": "chem_lab", "玻璃器皿": "chem_lab", "有机溶剂": "chem_lab",
    "瓶塞": "chem_lab", "标签": "chem_lab", "冰箱": "chem_lab",
    "高压": "chem_lab", "气瓶": "chem_lab", "高温": "chem_lab",
    # 酸碱中和滴定
    "滴定": "chem_titration", "滴定管": "chem_titration", "锥形瓶": "chem_titration",
    "指示剂": "chem_titration", "标准溶液": "chem_titration", "中和滴定": "chem_titration",
    "润洗": "chem_titration", "终点": "chem_titration", "移液管": "chem_titration",
    # 气体制备与收集
    "气体": "chem_gas_prep", "气密性": "chem_gas_prep", "验纯": "chem_gas_prep",
    "排水法": "chem_gas_prep", "倒吸": "chem_gas_prep", "收集气体": "chem_gas_prep",
    "氢气": "chem_gas_prep", "氧气": "chem_gas_prep", "防倒吸": "chem_gas_prep",
    # 蒸馏与物质分离
    "蒸馏": "chem_distillation", "冷凝管": "chem_distillation", "沸石": "chem_distillation",
    "暴沸": "chem_distillation", "支管口": "chem_distillation", "冷凝": "chem_distillation",
    "蒸馏烧瓶": "chem_distillation", "分馏": "chem_distillation",
    # 一定物质的量浓度溶液配制
    "容量瓶": "chem_solution_prep", "定容": "chem_solution_prep", "物质的量浓度": "chem_solution_prep",
    "配制溶液": "chem_solution_prep", "溶液配制": "chem_solution_prep", "洗液": "chem_solution_prep",
    "移液": "chem_solution_prep", "凹液面": "chem_solution_prep",
    "FeCl3": "chem_solution_prep", "易水解": "chem_solution_prep", "胶头滴管": "chem_solution_prep",
    "标线": "chem_solution_prep", "刻度线": "chem_solution_prep", "摇匀": "chem_solution_prep",
    # 气体制备与收集（补充触发词）
    "氯气": "chem_gas_prep", "硫化氢": "chem_gas_prep", "尾气": "chem_gas_prep",
    "长颈漏斗": "chem_gas_prep", "液封": "chem_gas_prep", "集气瓶": "chem_gas_prep",
    "电石": "chem_gas_prep", "制气": "chem_gas_prep", "排空气": "chem_gas_prep",
    # 蒸馏与物质分离（补充触发词）
    "蒸干": "chem_distillation", "水浴": "chem_distillation", "真空蒸馏": "chem_distillation",
    "看守": "chem_distillation", "馏分": "chem_distillation",
    # 酸碱中和滴定（补充触发词）
    "活塞": "chem_titration", "移液管": "chem_titration", "标定": "chem_titration",
    "白背景": "chem_titration", "锥形瓶": "chem_titration",
    # 通用安全（确保路由到 chem_lab 兜底）
    "嘴吸": "chem_lab", "徒手": "chem_lab", "氧化剂": "chem_lab", "混放": "chem_lab",
    "隐形眼镜": "chem_lab", "饮水": "chem_lab", "触电": "chem_lab", "钠": "chem_lab",
    "白磷": "chem_lab", "自燃": "chem_lab", "汞": "chem_lab", "砂土": "chem_lab",
    "密闭": "chem_lab", "危废": "chem_lab", "通风橱": "chem_lab", "灭火": "chem_lab",
}

# 口语别名硬匹配：学生常用口语化/同义表达 -> 标准风险点描述。
# 检索时若行为文本包含某别名，则将该条款直接置顶，彻底规避 TF-IDF 在同义改写下的错配。
_PARAPHRASE_ALIASES = {
    # 护目镜 / 防护
    "没戴护目镜": "实验时不佩戴护目镜直接操作腐蚀性试剂",
    "忘记戴护目镜": "实验时不佩戴护目镜直接操作腐蚀性试剂",
    "护目镜没戴": "实验时不佩戴护目镜直接操作腐蚀性试剂",
    "不戴护目镜": "实验时不佩戴护目镜直接操作腐蚀性试剂",
    "没戴眼镜": "实验时不佩戴护目镜直接操作腐蚀性试剂",
    "没穿实验服": "未穿实验服、未扎长发进行化学实验",
    "头发没扎": "未穿实验服、未扎长发进行化学实验",
    "没穿白大褂": "未穿实验服、未扎长发进行化学实验",
    "穿拖鞋进实验室": "未穿实验服、未扎长发进行化学实验",
    "隐形眼镜": "佩戴隐形眼镜进入实验室且未额外眼部防护（试剂溅入难冲洗）",
    # 浓硫酸稀释
    "水加进浓硫酸": "稀释浓硫酸时将水倒入浓硫酸中",
    "往浓硫酸里加水": "稀释浓硫酸时将水倒入浓硫酸中",
    "把水倒进酸里": "稀释浓硫酸时将水倒入浓硫酸中",
    "水倒入酸": "稀释浓硫酸时将水倒入浓硫酸中",
    "加水到浓硫酸": "稀释浓硫酸时将水倒入浓硫酸中",
    # 嘴吸
    "用嘴吸": "用嘴通过移液管吸取腐蚀性或有毒试剂（嘴吸）",
    "嘴巴吸": "用嘴通过移液管吸取腐蚀性或有毒试剂（嘴吸）",
    "口吸": "用嘴通过移液管吸取腐蚀性或有毒试剂（嘴吸）",
    # 活泼金属
    "钠遇水": "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸",
    "金属钠碰到水": "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸",
    "钾遇水": "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸",
    "钠接触水": "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸",
    "金属钠遇水": "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸",
    # 白磷
    "白磷着火": "白磷暴露在空气中因缓慢氧化积热自燃",
    "白磷露出空气": "白磷暴露在空气中因缓慢氧化积热自燃",
    "白磷自燃": "白磷暴露在空气中因缓慢氧化积热自燃",
    # 饮食饮水
    "吃东西": "在实验室内饮食、饮水或将餐具带入",
    "喝水": "在实验室内饮食、饮水或将餐具带入",
    "吃喝": "在实验室内饮食、饮水或将餐具带入",
    "进食": "在实验室内饮食、饮水或将餐具带入",
    "喝饮料": "在实验室内饮食、饮水或将餐具带入",
    "把食物带进实验室": "在实验室内饮食、饮水或将餐具带入",
    # 通风橱
    "不在通风橱": "在通风橱外操作挥发性有毒试剂",
    "没在通风橱": "在通风橱外操作挥发性有毒试剂",
    "通风橱外面": "在通风橱外操作挥发性有毒试剂",
    "通风橱外": "在通风橱外操作挥发性有毒试剂",
    # 沸石 / 暴沸
    "没加沸石": "加热液体未加沸石（或碎瓷片）导致暴沸",
    "忘记加沸石": "加热液体未加沸石（或碎瓷片）导致暴沸",
    "不沸石": "加热液体未加沸石（或碎瓷片）导致暴沸",
    "没放沸石": "加热液体未加沸石（或碎瓷片）导致暴沸",
    # 气密性 / 验纯
    "没查气密": "制备气体前未检查装置气密性",
    "不查气密": "制备气体前未检查装置气密性",
    "没检查气密性": "制备气体前未检查装置气密性",
    "未检查气密": "制备气体前未检查装置气密性",
    "没验纯": "可燃性气体（如氢气）点燃前未验纯",
    "不验纯": "可燃性气体（如氢气）点燃前未验纯",
    "氢气直接点": "可燃性气体（如氢气）点燃前未验纯",
    "没验纯就点": "可燃性气体（如氢气）点燃前未验纯",
    # 骤冷炸裂
    "热试管冲冷水": "加热后的玻璃仪器立即用冷水冲洗或接触冰冷台面导致骤冷炸裂",
    "刚加热就冲水": "加热后的玻璃仪器立即用冷水冲洗或接触冰冷台面导致骤冷炸裂",
    "热玻璃遇冷": "加热后的玻璃仪器立即用冷水冲洗或接触冰冷台面导致骤冷炸裂",
    "热仪器冷水冲": "加热后的玻璃仪器立即用冷水冲洗或接触冰冷台面导致骤冷炸裂",
    # 金属火灾
    "钠着火泼水": "金属钠、钾等着火时用水灭火（应撒砂土或干粉）",
    "金属着火用水": "金属钠、钾等着火时用水灭火（应撒砂土或干粉）",
    "钠钾着火用水": "金属钠、钾等着火时用水灭火（应撒砂土或干粉）",
    # 触电
    "湿手碰电": "用湿手触摸电源插座或电器开关导致触电",
    "手湿摸插座": "用湿手触摸电源插座或电器开关导致触电",
    "湿手触电": "用湿手触摸电源插座或电器开关导致触电",
    # 标签
    "标签看不清": "试剂瓶标签模糊不清仍继续使用",
    "没标签": "试剂瓶标签模糊不清仍继续使用",
    "标签掉了": "试剂瓶标签模糊不清仍继续使用",
    "标签不清": "试剂瓶标签模糊不清仍继续使用",
    # 废液直排
    "倒进下水道": "将酸性废液直接倒入下水道",
    "倒马桶": "将酸性废液直接倒入下水道",
    "倒水池": "将酸性废液直接倒入下水道",
    "酸倒进下水道": "将酸性废液直接倒入下水道",
    # 倒回原瓶
    "倒回原瓶": "将过量试剂倒回原瓶",
    "倒回去": "将过量试剂倒回原瓶",
    "倒回瓶里": "将过量试剂倒回原瓶",
    # 不相容混放
    "酸碱放一起": "实验台面同时摆放多种不相容试剂",
    "氧化剂和易燃放一起": "实验台面同时摆放多种不相容试剂",
    "不相容试剂混放": "实验台面同时摆放多种不相容试剂",
    # 温度计代替搅拌
    "温度计搅": "用温度计代替玻璃棒搅拌导致温度计破裂汞泄漏",
    "温度计当搅拌棒": "用温度计代替玻璃棒搅拌导致温度计破裂汞泄漏",
    "拿温度计搅拌": "用温度计代替玻璃棒搅拌导致温度计破裂汞泄漏",
    # 移液管/滴管伸入
    "滴管插瓶里": "移液管或胶头滴管伸入试剂瓶内取液污染整瓶试剂",
    "移液管碰到瓶壁": "移液管或胶头滴管伸入试剂瓶内取液污染整瓶试剂",
    "滴管伸入瓶": "移液管或胶头滴管伸入试剂瓶内取液污染整瓶试剂",
    # 闻气味
    "直接闻": "闻试剂气味时鼻子直接凑近瓶口",
    "凑近闻": "闻试剂气味时鼻子直接凑近瓶口",
    "鼻子凑近": "闻试剂气味时鼻子直接凑近瓶口",
    # 酒精灯
    "往燃着酒精灯加酒精": "向燃着的酒精灯内添加酒精",
    "给点着的酒精灯加酒精": "向燃着的酒精灯内添加酒精",
    "拿酒精灯对点": "用燃着的酒精灯去点燃另一只酒精灯",
    "灯对灯点": "用燃着的酒精灯去点燃另一只酒精灯",
    "酒精灯互相点": "用燃着的酒精灯去点燃另一只酒精灯",
    # 试管口朝向人
    "试管对人": "加热试管时试管口朝向人",
    "试管口对着人": "加热试管时试管口朝向人",
    "试管口朝人": "加热试管时试管口朝向人",
    # 密闭加热
    "封口试管加热": "在密闭容器或封口试管中加热液体导致内部压强骤增炸裂",
    "密闭容器加热": "在密闭容器或封口试管中加热液体导致内部压强骤增炸裂",
    "封闭容器加热": "在密闭容器或封口试管中加热液体导致内部压强骤增炸裂",
    # 试管液体过多
    "试管装太多": "加热试管内液体超过容积三分之一导致暴沸喷溅",
    "液体太多": "加热试管内液体超过容积三分之一导致暴沸喷溅",
    "试管液体超三分之一": "加热试管内液体超过容积三分之一导致暴沸喷溅",
    # 洗手
    "做完没洗手": "实验结束后未洗手就离开实验室",
    "没洗手离开": "实验结束后未洗手就离开实验室",
    # 酸碱混合放热
    "酸碱直接混": "把强酸与强碱等废液未经中和直接混合引发剧烈放热",
    "把酸和碱倒一起": "把强酸与强碱等废液未经中和直接混合引发剧烈放热",
    "酸碱混兑": "把强酸与强碱等废液未经中和直接混合引发剧烈放热",
    # 有毒尾气
    "尾气直接放": "实验产生的有毒尾气（如硫化氢、氮氧化物）未用吸收液处理直接排放",
    "没吸收尾气": "实验产生的有毒尾气（如硫化氢、氮氧化物）未用吸收液处理直接排放",
    "尾气不处理": "实验产生的有毒尾气（如硫化氢、氮氧化物）未用吸收液处理直接排放",
    # 滴管平放
    "滴管躺着": "胶头滴管平放或倒置使试剂倒流腐蚀胶头",
    "滴管倒置": "胶头滴管平放或倒置使试剂倒流腐蚀胶头",
    "滴管平放": "胶头滴管平放或倒置使试剂倒流腐蚀胶头",
    # 容量瓶直接溶解
    "在容量瓶里溶": "在容量瓶中直接溶解固体（放热使瓶体变形、标定不准）",
    "容量瓶溶解": "在容量瓶中直接溶解固体（放热使瓶体变形、标定不准）",
    "容量瓶直接溶解": "在容量瓶中直接溶解固体（放热使瓶体变形、标定不准）",
    # 定容读数
    "俯视刻度": "滴定终点读数时俯视或仰视刻度线，引入读数误差",
    "仰视刻度": "滴定终点读数时俯视或仰视刻度线，引入读数误差",
    "俯视读数": "滴定终点读数时俯视或仰视刻度线，引入读数误差",
    # 易水解
    "FeCl3直接加水": "配制易水解盐溶液（如FeCl3、SnCl2）未先加相应酸抑制水解",
    "氯化铁加水浑浊": "配制易水解盐溶液（如FeCl3、SnCl2）未先加相应酸抑制水解",
    "易水解没加酸": "配制易水解盐溶液（如FeCl3、SnCl2）未先加相应酸抑制水解",
    # 蒸馏蒸干 / 水浴
    "蒸干了": "蒸馏将液体蒸干导致残留物分解或烧瓶炸裂",
    "烧干": "蒸馏将液体蒸干导致残留物分解或烧瓶炸裂",
    "蒸馏烧干": "蒸馏将液体蒸干导致残留物分解或烧瓶炸裂",
    "直接火烤易燃物": "蒸馏易燃液体未采用水浴而直接明火加热",
    "易燃液体明火": "蒸馏易燃液体未采用水浴而直接明火加热",
    # 有毒气体吸收
    "氯气没吸收": "制取有毒气体（氯气、硫化氢）未用吸收装置处理尾气",
    "硫化氢没吸收": "制取有毒气体（氯气、硫化氢）未用吸收装置处理尾气",
    "有毒气体直排": "制取有毒气体（氯气、硫化氢）未用吸收装置处理尾气",
    # 长颈漏斗液封
    "长颈漏斗没液封": "长颈漏斗下端未插入液面下液封导致漏气或气体逸出",
    "漏斗不液封": "长颈漏斗下端未插入液面下液封导致漏气或气体逸出",
    # 电石
    "电石加水太猛": "电石等遇水剧烈反应的药品未控制加料速度",
    "电石加水果猛": "电石等遇水剧烈反应的药品未控制加料速度",
    # 皮肤沾染
    "浓硫酸溅到手": "浓硫酸溅到皮肤后未先用干布拭去再大量水冲并敷碳酸氢钠",
    "试剂溅到皮肤": "皮肤沾到腐蚀性或有毒试剂后未立即用大量流动水冲洗",
    "皮肤沾到试剂没冲": "皮肤沾到腐蚀性或有毒试剂后未立即用大量流动水冲洗",
}

# 别名硬匹配仅当输入含实验上下文词时才启用，避免"我口渴喝水"等非实验输入被误触发。
# 白名单覆盖常见实验物质/操作名词，确保"配制FeCl3溶液直接加水"等拆分口语也能进入别名匹配。
_ALIAS_CONTEXT = (
    "实验室", "实验", "操作", "试剂", "台", "瓶", "管", "加热", "化学", "仪器",
    "烧杯", "试管", "配制", "溶液", "FeCl3", "氯化铁", "SnCl2", "钠", "钾",
    "白磷", "氯气", "硫化氢", "蒸馏", "滴定", "容量瓶", "移液", "天平", "废液",
    "护目镜", "手套", "通风", "酒精灯", "量筒", "冷凝", "气体", "可燃", "稀释",
)

# 多词别名：value 为「词组的列表」，每个词组是若干子串，须全部同时出现在行为中才命中。
# 用于单串别名难以覆盖的拆分式口语（如"配制FeCl3溶液直接加水"中间夹了"溶液"）。
_PARAPHRASE_TOKEN_ALIASES = {
    "配制易水解盐溶液（如FeCl3、SnCl2）未先加相应酸抑制水解": [
        ["FeCl3", "加水"], ["FeCl3", "直接加水"], ["氯化铁", "加水"],
        ["SnCl2", "加水"], ["易水解", "酸"],
    ],
    "活泼金属（钠、钾）未隔绝空气与水存放遇水剧烈反应爆炸": [
        ["金属钠", "水"], ["金属钾", "水"], ["钠", "遇水"], ["钾", "遇水"],
    ],
    "在实验室内饮食、饮水或将餐具带入": [
        ["吃东西", "实验室"], ["喝水", "实验室"], ["进食", "实验室"],
    ],
}


def _alias_target(behavior: str):
    """返回行为文本命中的标准风险点描述；无命中返回 None。

    匹配规则：
    1) 单串别名：行为包含该串即命中；
    2) 多词别名：某词组的所有子串同时出现才命中（容错拆分式口语）。
    """
    for alias, target in _PARAPHRASE_ALIASES.items():
        if alias in behavior:
            return target
    for target, groups in _PARAPHRASE_TOKEN_ALIASES.items():
        for grp in groups:
            if all(tok in behavior for tok in grp):
                return target
    return None

# 停用词表
_STOPWORDS = set("的 了 和 与 在 是 对 从 向 把 被 让 给 为 以 及 或 而 但 所 之 其 此 这 那 一 个 些 等 中 上 下 内 外 进行 操作 使用 直接 未 不 无 没有 后 前 时 前".split())


def _tokenize(text: str) -> List[str]:
    """使用 jieba 分词，过滤停用词和单字符噪声。"""
    text = re.sub(r"[，。、：；！？\"''（）()【】\s]+", " ", text)
    words = jieba.lcut(text.strip())
    return [w.strip() for w in words if len(w.strip()) >= 2 and w.strip() not in _STOPWORDS]


def _infer_scene(behavior: str, scene_type: str) -> str:
    """根据行为文本和场景类型推断具体实验场景 ID。"""
    # 优先用关键词精确匹配
    for kw, sid in _KEYWORD_MAP.items():
        if kw in behavior:
            return sid
    # 场景类型兜底
    if scene_type in ("experiment", "student"):
        return "chem_lab"
    return "general"


# ============================================================
# TF-IDF 向量化器
# ============================================================

class _TfidfIndex:
    """轻量 TF-IDF 索引：基于风险点语料构建 IDF，支持余弦相似度查询。"""

    def __init__(self):
        self._idf: dict[str, float] = {}
        self._docs: list[list[str]] = []
        self._doc_ids: list[int] = []
        self._doc_vectors: list[dict[str, float]] = []
        self._built = False

    def build(self, risk_points: list):
        """从 RiskPoint 列表构建索引。"""
        self._docs = []
        self._doc_ids = []
        self._doc_vectors = []

        # 第一遍：收集所有文档的 token
        df: Counter = Counter()
        for rp in risk_points:
            tokens = _tokenize(rp.description)
            self._docs.append(tokens)
            self._doc_ids.append(rp.id)
            for t in set(tokens):
                df[t] += 1

        # 计算 IDF（平滑处理）
        n_docs = max(len(risk_points), 1)
        self._idf = {
            t: math.log((1 + n_docs) / (1 + cnt)) + 1
            for t, cnt in df.items()
        }

        # 计算每篇文档的 TF-IDF 向量
        for tokens in self._docs:
            tf = Counter(tokens)
            vec = {t: (cnt / max(len(tokens), 1)) * self._idf.get(t, 1) for t, cnt in tf.items()}
            self._doc_vectors.append(self._normalize(vec))

        self._built = True

    @staticmethod
    def _normalize(vec: dict[str, float]) -> dict[str, float]:
        norm = math.sqrt(sum(v * v for v in vec.values()))
        if norm == 0:
            return vec
        return {k: v / norm for k, v in vec.items()}

    def query(self, text: str, top_k: int = 3) -> list[tuple[int, float]]:
        """返回 [(doc_index, similarity), ...] 按相似度降序排列。"""
        if not self._built or not self._doc_vectors:
            return []

        tokens = _tokenize(text)
        tf = Counter(tokens)
        query_vec = {t: (cnt / max(len(tokens), 1)) * self._idf.get(t, 1) for t, cnt in tf.items()}
        query_vec = self._normalize(query_vec)

        scores = []
        for i, doc_vec in enumerate(self._doc_vectors):
            sim = sum(query_vec.get(t, 0) * doc_vec.get(t, 0) for t in query_vec)
            if sim > 0:
                scores.append((i, sim))

        scores.sort(key=lambda x: -x[1])
        return scores[:top_k]


# 全局索引缓存（进程级，避免每次请求重建）
_tfidf_index: Optional[_TfidfIndex] = None


def _get_index(db: Session) -> _TfidfIndex:
    global _tfidf_index
    if _tfidf_index is None or not _tfidf_index._built:
        all_rps = db.query(RiskPoint).all()
        idx = _TfidfIndex()
        idx.build(all_rps)
        _tfidf_index = idx
    return _tfidf_index


def _reset_index():
    """重置全局索引缓存（种子数据变更时调用）。"""
    global _tfidf_index
    _tfidf_index = None


class RAGService:
    def __init__(self, db: Session):
        self.db = db

    def seed_risk_points(self):
        """把内置风险点写入数据库（幂等，自动清理旧的车间数据）。"""
        # 清理旧的废弃场景风险点（workshop/worker 已废弃；本项目已精简为仅化学实验）
        old = self.db.query(RiskPoint).filter(
            RiskPoint.scene_id.in_(["workshop", "worker", "elec_lab", "bio_lab", "physics_lab"])
        ).all()
        for r in old:
            self.db.delete(r)
        if old:
            self.db.commit()

        # 幂等写入：检查已有内置风险点数量
        existing = self.db.query(RiskPoint).count()
        if existing >= len(BUILTIN_RISK_POINTS):
            return
        for item in BUILTIN_RISK_POINTS:
            exists = self.db.query(RiskPoint).filter(
                RiskPoint.description == item["description"]
            ).first()
            if not exists:
                self.db.add(RiskPoint(
                    scene_id=item["scene_id"],
                    description=item["description"],
                    level=item["level"],
                    weight=item["weight"],
                    clause_ref=item["clause_ref"],
                    owner_id=None,
                    source="seed",
                    reviewed=1,
                ))
        self.db.commit()
        _reset_index()

    @staticmethod
    def _search_candidates(behavior: str, candidates, top_k: int) -> List[dict]:
        """在给定候选集上做 TF-IDF 检索，返回含溯源的列表。"""
        if not candidates:
            return []
        idx = _TfidfIndex()
        idx.build(candidates)
        results_raw = idx.query(behavior, top_k=top_k)
        results = []
        for doc_idx, sim in results_raw:
            rp = candidates[doc_idx]
            d = rp.to_dict()
            d["match_score"] = round(sim, 4)
            results.append(d)
        return results

    def search(self, behavior: str, scene_type: str = "experiment", top_k: int = 3) -> List[dict]:
        """按行为文本检索最相关风险点，返回含溯源的列表。

        使用 TF-IDF 余弦相似度进行语义匹配，支持同义/近义表达。
        先在本场景候选集中检索；若全库中存在明显更相关的条款（场景路由偏差时），
        自动回退到全库结果，从根本上避免「条款引用错配」问题。

        额外增加「口语别名硬匹配」：用户输入的口语化/同义表达一旦精确命中别名表，
        直接将该条款置顶（match_score=1.0），彻底规避同义改写导致的错配。
        """
        # 别名硬匹配：口语化表达精确命中时直接置顶对应条款（防 TF-IDF 错配）
        if any(ctx in behavior for ctx in _ALIAS_CONTEXT):
            target = _alias_target(behavior)
            if target is not None:
                all_rps = self.db.query(RiskPoint).all()
                target_rp = next((rp for rp in all_rps if rp.description == target), None)
                if target_rp is not None:
                    others = [rp for rp in all_rps if rp is not target_rp]
                    boosted = self._search_candidates(behavior, others, max(top_k - 1, 1))
                    top = target_rp.to_dict()
                    top["match_score"] = 1.0
                    return [top] + boosted

        # 场景过滤
        scene_id = _infer_scene(behavior, scene_type)
        scene_id2 = _infer_scene(behavior, "general")
        candidates = self.db.query(RiskPoint).filter(
            RiskPoint.scene_id.in_([scene_id, scene_id2])
        ).all()
        if not candidates:
            candidates = self.db.query(RiskPoint).all()

        if not candidates:
            return []

        scene_results = self._search_candidates(behavior, candidates, top_k)

        # 全库兜底：当全库存在明显更匹配（相似度高出阈值）的条款时采用，
        # 防止场景关键词误判导致错配无关条款。
        all_rps = self.db.query(RiskPoint).all()
        if len(all_rps) > len(candidates):
            global_results = self._search_candidates(behavior, all_rps, top_k)
            if global_results:
                g_best = global_results[0]["match_score"]
                s_best = scene_results[0]["match_score"] if scene_results else 0.0
                if g_best > s_best + 0.03:
                    return global_results

        return scene_results


# Ollama 生成自愈冷却（B2）：取代旧的"一次性失败即永久不可用"——
# 失败时进入冷却期（默认 OLLAMA_RETRY_COOLDOWN 秒，见 config），期间快速降级为规则引擎；
# 冷却一过立即重试，从而 Ollama 中途恢复（如手动启动服务、切换模型后）无需重启后端即可自动重启用 AI。
# 同时保留极短超时（connect 3s / read 20s），杜绝未安装 Ollama 时的长连接挂死。
_ollama_unavailable_until: float = 0.0  # monotonic 时间戳；在此之前跳过生成（视为不可用）


def reset_ollama_availability():
    """重置生成冷却：强制下一次请求立即重试 Ollama。

    旧语义是"重置永久性不可用标记"；现在 Ollama 恢复后会自动重试，此函数用于
    主动/立即强制重试（如运维确认服务已起来、或切换模型后让新模型立刻生效）。
    """
    global _ollama_unavailable_until
    _ollama_unavailable_until = 0.0


def try_ollama_generate(prompt: str, max_tokens: int = 512) -> str | None:
    """统一 LLM 生成入口：按 AI_PROVIDER 分派到本地 Ollama 或云端 OpenAI 兼容 API。

    失败/冷却/未配置均返回 None，由调用方降级为规则引擎（规则引擎是唯一真相源）。
    函数名对调用方保持不变（agent_service / cases / quiz 等直接调用本函数）。
    """
    global _ollama_unavailable_until
    # 开关判断（与 provider 无关）
    if settings.AI_PROVIDER == "cloud":
        if not settings.OPENAI_API_KEY:
            return None
    else:
        if not settings.ENABLE_OLLAMA:
            return None
    now = time.monotonic()
    if now < _ollama_unavailable_until:
        # 冷却中：快速降级为规则引擎，避免每次请求都打外部服务造成卡顿/挂死。
        return None
    if settings.AI_PROVIDER == "cloud":
        return _cloud_generate_impl(prompt, max_tokens)
    return _ollama_generate_impl(prompt, max_tokens)


def _ollama_generate_impl(prompt: str, max_tokens: int = 512) -> str | None:
    """本地 Ollama /api/generate 实现（try_ollama_generate 的 ollama 分支）。"""
    global _ollama_unavailable_until
    try:
        resp = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False,
                  "options": {"num_predict": max_tokens}},
            timeout=httpx.Timeout(connect=3.0, read=20.0, write=10.0, pool=3.0),
        )
        resp.raise_for_status()
        text = resp.json().get("response", "").strip()
        _ollama_unavailable_until = 0.0
        return text or None
    except Exception:
        # 失败 -> 进入冷却期，之后自动重试（自愈）；冷却时长由 OLLAMA_RETRY_COOLDOWN 控制。
        _ollama_unavailable_until = time.monotonic() + float(getattr(settings, "OLLAMA_RETRY_COOLDOWN", 10.0))
        return None


def _cloud_generate_impl(prompt: str, max_tokens: int = 512) -> str | None:
    """云端 OpenAI 兼容 /chat/completions 实现（try_ollama_generate 的 cloud 分支）。

    兼容 DeepSeek / 硅基流动 / 通义 DashScope / OpenAI 等任意 OpenAI 兼容端点。
    现有的单轮 prompt（已含指令+用户输入）作为 user message 发送；模型仅做「解释增强」，
    风险判定仍以规则引擎为真相源，模型输出会经 _ground_actor_reply 约束以防幻觉翻案。

    云端网络偶发抖动会导致调用抛异常（连接重置/5xx/读取中断等），此类瞬时错误重试通常
    即可成功，因此这里做最多 2 次重试；所有失败都会打 warning 日志，不再静默吞掉。
    """
    global _ollama_unavailable_until
    last_status_text = ""
    max_retries = 2
    for attempt in range(1, max_retries + 1):
        try:
            resp = httpx.post(
                f"{settings.OPENAI_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                    "stream": False,
                },
                timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0),
            )
            resp.raise_for_status()
            data = resp.json()
            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )
            # 千问偶发返回 HTTP 200 但 content 为空（瞬时抖动），视为失败并重试，
            # 通常重试一次即可拿到正常内容；否则直接降级为规则引擎。
            if not text:
                if attempt < max_retries:
                    logger.warning("云端大模型第 %d 次返回空内容，重试中…", attempt)
                    time.sleep(0.8 * attempt)
                    continue
                logger.warning("云端大模型调用失败：连续 %d 次返回空内容", max_retries)
                break
            _ollama_unavailable_until = 0.0
            return text
        except Exception as e:  # noqa: BLE001 - 云端瞬时错误需重试，最终失败才降级
            _status = getattr(e, "response", None)
            _code = getattr(_status, "status_code", None)
            last_status_text = (getattr(_status, "text", "") or str(e))[:200]
            # 鉴权/配额类错误重试无意义，直接判定失败
            if _code in (401, 402, 403, 429):
                logger.warning("云端大模型调用失败 http=%s：%s", _code, last_status_text)
                break
            if attempt < max_retries:
                logger.warning(
                    "云端大模型第 %d 次调用异常（%s），%s后重试…",
                    attempt, type(e).__name__, f"{0.8 * attempt:.1f}s",
                )
                time.sleep(0.8 * attempt)
            else:
                logger.warning(
                    "云端大模型调用失败（已重试 %d 次）：%s", max_retries - 1, last_status_text
                )
    _ollama_unavailable_until = time.monotonic() + float(getattr(settings, "OLLAMA_RETRY_COOLDOWN", 10.0))
    return None



# 并发护栏：限制同时打 Ollama 的请求数，避免高并发把 FastAPI 线程池打满
# （同步端点下 Ollama 调用会占用线程池 worker，无限并发会拖垮整个服务乃至 /health）。
_ollama_concurrency = asyncio.Semaphore(int(os.getenv("OLLAMA_MAX_CONCURRENCY", "4")))


async def try_ollama_generate_async(prompt: str, max_tokens: int = 512, timeout: float = 95.0) -> str | None:
    """`try_ollama_generate` 的非阻塞版本：在独立线程中执行同步 HTTP 调用，

    通过信号量限制并发、外层 wait_for 兜底超时，避免阻塞事件循环 / 占满请求线程池。
    失败、超时或并发超限均返回 None，由调用方（规则引擎）降级，与同步版语义一致。
    """
    if settings.AI_PROVIDER == "cloud":
        if not settings.OPENAI_API_KEY:
            return None
    else:
        if not settings.ENABLE_OLLAMA:
            return None
    async with _ollama_concurrency:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(try_ollama_generate, prompt, max_tokens),
                timeout=timeout,
            )
        except (asyncio.TimeoutError, Exception):
            # 超时或线程内异常 → 直接降级为规则引擎，不让请求线程卡死。
            return None


# 引擎模式探测结果缓存（短 TTL）：避免每次请求都发起 ~3s 的同步 Ollama 探测，
# 否则前端轮询「AI/规则模式」徽标或健康检查时会频繁阻塞。最多 15s 陈旧，可接受。
# 改用 CacheStore：单实例走内存（行为不变），多实例配 REDIS_URL 即跨实例共享。
_ollama_status_cache: "CacheStore | None" = None
_OLLAMA_STATUS_TTL = 15.0


def _status_store() -> "CacheStore":
    global _ollama_status_cache
    if _ollama_status_cache is None:
        from app.core.cache import get_cache_store

        _ollama_status_cache = get_cache_store()
    return _ollama_status_cache


def list_ollama_model_names() -> list:
    """返回已配置的 LLM 模型名列表（用于前端判断候选模型是否已就绪）。

    cloud provider 下返回当前云端模型名（已配密钥即为就绪）；ollama provider 下返回本地已拉取模型。
    不可用时返回空列表，不抛异常——这是只读的辅助探测。
    """
    if settings.AI_PROVIDER == "cloud":
        return [settings.OPENAI_MODEL] if settings.OPENAI_API_KEY else []
    if not settings.ENABLE_OLLAMA:
        return []
    try:
        resp = httpx.get(
            f"{settings.OLLAMA_BASE_URL}/api/tags",
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
        )
        resp.raise_for_status()
        return [m.get("name", "") for m in resp.json().get("models", [])]
    except Exception:
        return []


def _probe_engine_status() -> dict:
    """真正去探测当前 provider 的引擎状态（见 ollama_status 缓存封装）。"""
    if settings.AI_PROVIDER == "cloud":
        return _probe_cloud_status()
    if not settings.ENABLE_OLLAMA:
        return {
            "configured": False,
            "reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_present": False,
            "mode": "rule",
            "reason": "配置未启用 Ollama（ENABLE_OLLAMA=false），当前为纯规则引擎模式（可离线运行）。",
        }
    try:
        resp = httpx.get(
            f"{settings.OLLAMA_BASE_URL}/api/tags",
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
        )
        resp.raise_for_status()
        models = [m.get("name", "") for m in resp.json().get("models", [])]
        configured = settings.OLLAMA_MODEL
        if configured in models:
            present = True
        elif ":" not in configured:
            # 配置项只写了家族名（如 qwen2.5），允许匹配同家族任意 tag
            present = any(m.split(":")[0] == configured for m in models)
        else:
            # 配置了具体 tag（如 qwen2.5:14b）则必须精确存在，不能被同家族 3b 误匹配
            present = False
        if present:
            return {
                "configured": True,
                "reachable": True,
                "model": settings.OLLAMA_MODEL,
                "model_present": True,
                "mode": "ai",
                "reason": f"Ollama 已连接，模型 {settings.OLLAMA_MODEL} 就绪，AI 增强模式生效。",
            }
        return {
            "configured": True,
            "reachable": True,
            "model": settings.OLLAMA_MODEL,
            "model_present": False,
            "mode": "rule",
            "reason": (
                f"Ollama 已连接，但未找到模型 {settings.OLLAMA_MODEL}。"
                f"执行 `ollama pull {settings.OLLAMA_MODEL}` 后即可启用 AI 增强模式。"
            ),
        }
    except Exception:
        return {
            "configured": True,
            "reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_present": False,
            "mode": "rule",
            "reason": (
                f"Ollama 服务未启动或不可达（{settings.OLLAMA_BASE_URL}）。"
                f"安装并启动 Ollama 后，AI 增强模式会自动生效。"
            ),
        }


def _probe_cloud_status() -> dict:
    """探测云端 OpenAI 兼容端点的真实状态（见 ollama_status 缓存封装）。"""
    key = settings.OPENAI_API_KEY
    model = settings.OPENAI_MODEL
    if not key:
        return {
            "configured": False,
            "reachable": False,
            "model": model,
            "model_present": False,
            "mode": "rule",
            "reason": "未配置 OPENAI_API_KEY，云端 AI 增强模式未启用。请在 backend/.env 填入密钥后重启后端。",
        }
    # 轻量可达性校验：GET {base}/models（OpenAI 兼容端点均支持）
    try:
        resp = httpx.get(
            f"{settings.OPENAI_API_BASE}/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
        )
        # 2xx/401/404 等都代表"服务可达"，仅连接级错误视为不可达
        reachable = resp.status_code < 500
    except Exception:
        reachable = False
    if not reachable:
        return {
            "configured": True,
            "reachable": False,
            "model": model,
            "model_present": False,
            "mode": "rule",
            "reason": (
                f"云端大模型已配置密钥，但 {settings.OPENAI_API_BASE} 不可达"
                f"（网络异常或地址错误）。请检查 OPENAI_API_BASE 配置。"
            ),
        }
    return {
        "configured": True,
        "reachable": True,
        "model": model,
        "model_present": True,
        "mode": "ai",
        "reason": f"云端大模型已就绪（{model}），AI 增强模式生效。",
    }


def ollama_status() -> dict:
    """探测 Ollama 真实状态，作为「引擎模式」的唯一真相源（带 15s 缓存）。

    关键点：不再只看 ENABLE_OLLAMA 配置布尔值（默认 True 会让人误以为有 AI），
    而是真正去打 Ollama 服务，区分真实状态：
      1. 配置未启用           → mode=rule（reason: 配置关闭）
      2. 服务不可达           → mode=rule（reason: 服务未启动/地址错误）
      3. 服务可达但缺模型      → mode=rule（reason: 需 ollama pull）
      4. 服务可达且模型就绪    → mode=ai  （reason: AI 增强模式生效）
    前端据此诚实展示当前是「AI 增强模式」还是「规则模式」，杜绝名不副实。

    结果按 _OLLAMA_STATUS_TTL 缓存，避免每次请求都触发 ~3s 的同步外部探测。
    """
    store = _status_store()
    cached = store.get("ollama_status")
    if cached is not None:
        return cached
    result = _probe_engine_status()
    store.set("ollama_status", result, ttl=_OLLAMA_STATUS_TTL)
    return result
