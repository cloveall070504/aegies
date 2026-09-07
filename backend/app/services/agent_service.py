"""双智能体服务：Actor（执行AI）生成初稿，Critic（校验AI）反向复核。

改进点：
- Actor：Ollama 可用时调用本地 LLM 生成自然语言推演；不可用时降级为规则引擎
- Critic：对 Actor 输出做多维度校验（风险等级一致性、条款溯源准确性、关键词覆盖度），
  而非仅检查"需修正"三个字
- 语义匹配：使用 RAG 服务的 TF-IDF 余弦相似度替代 2-gram 匹配
"""
import re
from typing import List

from app.services.prompt_service import get_template
from app.services.rag_service import RAGService, _tokenize, try_ollama_generate, try_ollama_generate_async
from app.services.scoring_service import compute_risk_score, none_breakdown
from app.services.risk_outcomes import get_risk_outcome, match_risk_outcome
from app.services.slot_classifier import classify_safety
from app.config import settings

# 风险关键词分级（用于规则引擎降级路径）
# 关键建模原则：RISK_KEYWORDS 只收录「确实做错了动作」的词，
# 不要把「描述危险物质/环境」的词（腐蚀/高温/易燃/明火…）当作违规动作——
# 否则学生会把"在通风橱处理易燃试剂""确认无明火后离开"这类正确操作误判为高危。
RISK_KEYWORDS = {
    # ===== 高危：做错动作即触发红线 =====
    "high": [
        # —— 个人防护 / 违规 ——
        "不戴", "未佩戴", "未戴", "没戴", "没有戴", "没佩戴", "没有佩戴", "不佩戴",
        "没带", "没有带", "不穿", "未穿", "没穿", "没有穿",
        "不戴手套", "没戴手套", "没有戴手套", "未戴手套",
        "不戴护目镜", "未戴护目镜", "没戴护目镜", "不佩戴护目镜",
        "未断电", "没断电", "没有断电", "不断电", "未断", "不关", "未停",
        "无证", "裸手", "徒手", "违规", "未配平", "破皮", "破损", "严禁",
        "无人值守", "独自", "下水道", "嘴吸", "倒回", "溅到", "溅入", "灼伤",
        "骤冷", "冷水冲洗", "热玻璃",
        # —— 试剂 / 废液 ——
        "废液倒入下水道", "倒下水道", "向下水道",
        "混放", "氧化剂混放", "易燃物混放",
        "废液混合", "性质不明", "混合废液",
        "酸碱混合", "强酸强碱", "废液未中和",
        "饮食", "进食", "餐具", "吃喝",
        "未立即冲洗", "未用水冲洗", "沾到未冲",
        "溅到未", "溅到后未",
        # —— 加热 / 玻璃仪器 ——
        "试管口朝向人", "朝向人", "试管口朝人", "对准人", "对着人",
        "水倒入浓硫酸", "水加入浓硫酸", "水加进浓硫酸",
        "易燃溶剂附近明火", "易燃溶剂明火", "直接明火加热", "未水浴",
        "通风橱外", "橱外",
        "骤冷炸裂",
        "密闭容器加热", "封口试管加热", "密闭加热",
        "钠遇水", "钾遇水", "活泼金属遇水", "遇水剧烈",
        "白磷暴露", "白磷露置", "白磷自燃",
        "湿手", "湿手触摸", "湿手摸",
        "钠着火用水", "金属火用水", "着火用水灭", "钾着火用水",
        "待测液润洗", "用待测液润洗", "润洗锥形瓶",
        "未检查气密性", "未检漏", "未查气密",
        "未验纯",
        "先熄灭酒精灯", "先灭灯", "先熄灯", "倒吸",
        "未加沸石", "忘加沸石", "导致暴沸", "引发暴沸",
        "未冷却", "未冷至室温", "趁热定容", "热溶液定容",
        "用嘴吸", "用嘴吸取",
        "产生有毒气体", "有毒气体未处理",
        "尾气未处理", "尾气直排", "有毒尾气",
        "未戴防毒面具", "未戴呼吸防护",
        "未标定", "未经标定",
        "制毒气", "制取有毒", "氯气尾气", "硫化氢",
        "未液封", "未插液面",
        "未通冷凝水", "未先通冷凝", "先加热未通水",
        "蒸干", "蒸至干", "蒸干烧瓶",
    ],
    # ===== 中危：存在隐患/不规范，但非即时红线 =====
    "medium": [
        "省略", "跳过", "未按", "不按", "凭经验", "大意", "随意", "简化", "不看", "不读",
        "不查", "不清", "未清", "不关电源", "忘记", "漏", "少", "临时", "替代", "未检查",
        "未消毒", "未确认", "未配平", "模糊", "缠绕", "打结", "涂改", "伪造",
        # —— 个人防护 / 实验室规范 ——
        "未关闭酒精灯", "未熄灭",
        "鼻子凑近", "凑近瓶口", "直接闻", "凑近闻",
        "未穿实验服", "未扎长发", "未穿实验",
        "标签模糊", "标签不清",
        "不相容试剂", "同台摆放", "混摆",
        "有裂缝", "有裂痕",
        "倒回原瓶",
        "冰箱食品", "冰箱放", "冰箱存放食物",
        # —— 滴定 / 溶液配制 ——
        "未润洗", "滴定管未润洗",
        "未赶气泡", "未排气泡", "尖嘴气泡",
        "俯视", "仰视", "俯视刻度", "仰视刻度",
        "未洗涤", "未洗烧杯", "未洗玻璃棒",
        "手直接拿取", "直接拿取", "手摸试剂",
        "未分类", "废弃物混",
        "量筒配制", "量筒配",
        "易水解", "未加酸",
        "容量瓶溶解", "直接溶解固体",
        "玻璃棒未靠", "未靠内壁",
        # —— 加热 / 蒸馏 / 玻璃仪器 ——
        "试管口未向下", "未向下倾斜", "固体加热未倾斜",
        "进出水接反", "冷凝管接反",
        "试剂瓶直接加热", "直接置于热源",
        "温度计搅拌", "温度计代搅拌",
        "未预热", "未先预热",
        "量筒加热", "量杯加热", "量器加热",
        "超量加热", "液体超过", "试管液体过多",
        "同台堆放", "无隔离", "堆放",
        "滴定管活塞漏液",
        "滴定过快", "滴定速度过快",
        "剧烈摇动", "锥形瓶溅出",
        "电石", "加料过快",
        "真空蒸馏", "未查承压",
        # —— 一般违纪 ——
        "燃着酒精灯", "去点燃", "用酒精灯点",
        "奔跑", "追逐", "打闹", "奔跑打闹",
        "佩戴隐形眼镜",
        "直接放天平", "称量盘", "直接称量",
        "伸入瓶内", "滴管伸入", "移液管伸入",
        "未洗手", "结束未洗手",
    ],
    # ===== 低危：习惯/轻微疏忽 =====
    "low": ["快速", "赶时间", "边做边看", "少量", "轻拿", "缓慢", "未盖"],
}

# 仅描述「危险物质/环境」的上下文词：单独出现不构成违规动作，不计入风险分与等级；
# 仅用于领域识别与 RAG 佐证（如"处理易燃试剂"本身无错，错在方式）。
CONTEXT_KEYWORDS = ["腐蚀", "高温", "高压", "易燃", "爆炸", "明火", "危险", "浓硫酸", "试剂", "酒精灯"]

# 高危概念的正向覆盖词：判定 Actor 是否「已就某高危概念给出提醒/整改」时，
# 不仅看字面负向词（未佩戴/直接）是否出现，也看其正向改写或防护用语是否出现。
# 这样当 Actor 用「请佩戴护目镜」「缓慢沿壁加入」等正确整改语言时，不会被误判为遗漏。
# 仅当 Actor 对该危险概念「一个相关词都没提」时才视为真正遗漏。
KEYWORD_POSITIVE = {
    # ===== 原有 =====
    "未佩戴": ["佩戴", "戴好", "护目镜", "防护", "手套", "穿戴", "做好防护", "防护装备", "防护用具"],
    "未戴":   ["佩戴", "戴好", "护目镜", "防护", "手套", "穿戴", "做好防护"],
    "不戴":   ["佩戴", "戴好", "护目镜", "防护", "手套", "穿戴", "做好防护"],
    "未穿":   ["穿好", "穿戴", "防护服", "实验服", "防护", "穿着"],
    "不穿":   ["穿好", "穿戴", "防护服", "实验服", "防护", "穿着"],
    "未断电": ["断电", "切断电源", "关闭电源", "停电", "断开电源"],
    "未关":   ["关闭", "关好", "断开", "切断"],
    "未停":   ["停止", "停机", "关闭", "关停"],
    "未配平": ["配平", "平衡", "校准"],
    "未确认": ["确认", "核实", "核对"],
    "未检查": ["检查", "查验", "核对"],
    "未消毒": ["消毒", "灭菌", "清洁"],
    "未清":   ["清理", "清洁", "清空", "清洗"],
    "直接":   ["缓慢", "沿壁", "沿器壁", "沿杯壁", "不要直接", "避免直接", "间接",
               "分步", "依次", "慢慢", "防止飞溅", "先加", "先放"],
    "倒入":   ["加入", "添加", "注入", "加注", "转移", "倾倒"],
    "裸手":   ["佩戴手套", "戴手套", "手套", "防护", "不直接接触"],
    "徒手":   ["佩戴手套", "戴手套", "手套", "防护", "工具夹持"],
    "嘴吸":   ["移液枪", "洗耳球", "吸耳球", "负压", "移液"],
    "下水道": ["废液桶", "指定容器", "收集", "废液", "回收"],
    "倒回":   ["废液", "回收", "指定容器", "不可倒回"],
    "无人值守": ["值守", "看管", "有人", "监护"],
    "独自":   ["陪同", "他人", "老师", "同伴", "有人"],
    "违规":   ["遵守", "按规范", "合规", "按规定", "依规"],
    # ===== 增补：与 RISK_KEYWORDS 新增高危词对应的正向覆盖 =====
    "不戴护目镜": ["佩戴护目镜", "戴好护目镜", "护目镜", "做好眼部防护"],
    "未戴护目镜": ["佩戴护目镜", "戴好护目镜", "护目镜", "做好眼部防护"],
    "没戴护目镜": ["佩戴护目镜", "戴好护目镜", "护目镜", "做好眼部防护"],
    "不佩戴护目镜": ["佩戴护目镜", "戴好护目镜", "护目镜", "做好眼部防护"],
    "废液倒入下水道": ["废液桶", "指定容器", "收集", "回收"],
    "倒下水道": ["废液桶", "指定容器", "收集", "回收"],
    "向下水道": ["废液桶", "指定容器", "收集", "回收"],
    "试管口朝向人": ["试管口不对人", "朝向无人处", "朝外", "不对人"],
    "朝向人": ["试管口不对人", "朝向无人处", "朝外", "不对人"],
    "试管口朝人": ["试管口不对人", "朝向无人处", "朝外", "不对人"],
    "对准人": ["朝向无人处", "朝外", "不对人"],
    "对着人": ["朝向无人处", "朝外", "不对人"],
    "水倒入浓硫酸": ["酸入水", "沿杯壁", "缓慢加入水中"],
    "水加入浓硫酸": ["酸入水", "沿杯壁", "缓慢加入水中"],
    "水加进浓硫酸": ["酸入水", "沿杯壁", "缓慢加入水中"],
    "易燃溶剂附近明火": ["远离明火", "防爆", "移开火源"],
    "易燃溶剂明火": ["远离明火", "防爆", "移开火源"],
    "直接明火加热": ["水浴加热", "油浴", "间接加热", "远离明火"],
    "未水浴": ["水浴加热", "油浴", "间接加热"],
    "通风橱外": ["通风橱内", "通风橱", "橱内"],
    "橱外": ["通风橱内", "通风橱", "橱内"],
    "骤冷炸裂": ["自然冷却", "冷却至室温", "不骤冷"],
    "待测液润洗": ["用蒸馏水洗", "不用待测液", "洗涤干净"],
    "用待测液润洗": ["用蒸馏水洗", "不用待测液", "洗涤干净"],
    "润洗锥形瓶": ["用蒸馏水洗", "不用待测液", "洗涤干净"],
    "未检查气密性": ["检查气密性", "检漏", "查气密"],
    "未检漏": ["检查气密性", "检漏", "查气密"],
    "未查气密": ["检查气密性", "检漏", "查气密"],
    "未验纯": ["先验纯", "验纯", "点燃前验纯"],
    "先熄灭酒精灯": ["先移导管", "后灭灯", "防倒吸"],
    "先灭灯": ["先移导管", "后灭灯", "防倒吸"],
    "先熄灯": ["先移导管", "后灭灯", "防倒吸"],
    "倒吸": ["先移导管", "后灭灯", "防倒吸"],
    "未加沸石": ["加沸石", "加碎瓷片", "防暴沸"],
    "忘加沸石": ["加沸石", "加碎瓷片", "防暴沸"],
    "暴沸": ["加沸石", "加碎瓷片", "防暴沸"],
    "未冷却": ["冷却至室温", "待冷却", "冷后定容"],
    "未冷至室温": ["冷却至室温", "待冷却", "冷后定容"],
    "趁热定容": ["冷却至室温", "待冷却", "冷后定容"],
    "热溶液定容": ["冷却至室温", "待冷却", "冷后定容"],
    "用嘴吸": ["移液枪", "洗耳球", "吸耳球", "负压", "移液"],
    "用嘴吸取": ["移液枪", "洗耳球", "吸耳球", "负压", "移液"],
    "混放": ["分开存放", "隔离", "分开放", "分类"],
    "氧化剂混放": ["分开存放", "隔离", "分开放", "分类"],
    "易燃物混放": ["分开存放", "隔离", "分开放", "分类"],
    "饮食": ["不饮食", "禁食", "不带餐具"],
    "进食": ["不饮食", "禁食", "不带餐具"],
    "餐具": ["不饮食", "禁食", "不带餐具"],
    "吃喝": ["不饮食", "禁食", "不带餐具"],
    "废液混合": ["分类收集", "分开", "不混合"],
    "性质不明": ["先鉴别", "查MSDS", "咨询"],
    "混合废液": ["分类收集", "分开", "不混合"],
    "酸碱混合": ["先中和", "分别收集", "分开"],
    "强酸强碱": ["先中和", "分别收集", "分开"],
    "废液未中和": ["先中和", "分别收集", "分开"],
    "未立即冲洗": ["立即冲洗", "大量水冲", "冲15分钟"],
    "未用水冲洗": ["立即冲洗", "大量水冲", "冲15分钟"],
    "沾到未冲": ["立即冲洗", "大量水冲", "冲15分钟"],
    "溅到未": ["先干布拭", "再水冲", "敷碳酸氢钠"],
    "溅到后未": ["先干布拭", "再水冲", "敷碳酸氢钠"],
    "钠遇水": ["隔绝水", "煤油保存", "干燥存放"],
    "钾遇水": ["隔绝水", "煤油保存", "干燥存放"],
    "活泼金属遇水": ["隔绝水", "煤油保存", "干燥存放"],
    "遇水剧烈": ["隔绝水", "煤油保存", "干燥存放"],
    "白磷暴露": ["水封保存", "浸水", "避光"],
    "白磷露置": ["水封保存", "浸水", "避光"],
    "白磷自燃": ["水封保存", "浸水", "避光"],
    "产生有毒气体": ["通风橱", "尾气吸收", "吸收装置"],
    "有毒气体未处理": ["通风橱", "尾气吸收", "吸收装置"],
    "湿手": ["干燥手", "擦干", "断电后操作"],
    "湿手触摸": ["干燥手", "擦干", "断电后操作"],
    "湿手摸": ["干燥手", "擦干", "断电后操作"],
    "钠着火用水": ["撒砂土", "干粉灭火器", "不浇水"],
    "金属火用水": ["撒砂土", "干粉灭火器", "不浇水"],
    "着火用水灭": ["撒砂土", "干粉灭火器", "不浇水"],
    "钾着火用水": ["撒砂土", "干粉灭火器", "不浇水"],
    "密闭容器加热": ["敞口", "带出气口", "不封口"],
    "封口试管加热": ["敞口", "带出气口", "不封口"],
    "密闭加热": ["敞口", "带出气口", "不封口"],
    "尾气未处理": ["尾气吸收", "吸收液", "通风橱"],
    "尾气直排": ["尾气吸收", "吸收液", "通风橱"],
    "有毒尾气": ["尾气吸收", "吸收液", "通风橱"],
    "未戴防毒面具": ["佩戴防毒面具", "呼吸防护", "戴面具"],
    "未戴呼吸防护": ["佩戴防毒面具", "呼吸防护", "戴面具"],
    "未标定": ["先标定", "标定后", "用标定液"],
    "未经标定": ["先标定", "标定后", "用标定液"],
    "制毒气": ["吸收装置", "尾气处理", "通风橱"],
    "制取有毒": ["吸收装置", "尾气处理", "通风橱"],
    "氯气尾气": ["吸收装置", "尾气处理", "通风橱"],
    "硫化氢": ["吸收装置", "尾气处理", "通风橱"],
    "未液封": ["液封", "插入液面下", "浸没"],
    "未插液面": ["液封", "插入液面下", "浸没"],
    "未通冷凝水": ["先通冷凝水", "先通水", "后加热"],
    "未先通冷凝": ["先通冷凝水", "先通水", "后加热"],
    "先加热未通水": ["先通冷凝水", "先通水", "后加热"],
    "蒸干": ["留少量", "不蒸干", "剩残余"],
    "蒸至干": ["留少量", "不蒸干", "剩残余"],
    "蒸干烧瓶": ["留少量", "不蒸干", "剩残余"],
}

# 「直接」后紧跟这些危险动作动词时才算高危（如「直接倒入」「直接打开」「直接通电」）；
# 仅「直接开始/直接操作」等省略准备步骤的语境不应升级为高危，避免误报。
_DIRECT_DANGER_VERBS = (
    "倒入", "打开", "通电", "启动", "运行", "点火", "加热", "接触",
    "操作", "使用", "连接", "移", "送", "充", "拆", "改", "接", "切",     "关",
)

# 方向性辅助判定词：仅用于内部「高危信号」判定（如"倒入"用于识别"水被倒入强酸"
# 的高危倾倒场景），其本身不代表需 Actor 复述的离散危险概念，故在 Critic 关键词
# 覆盖检查中剔除，避免对正确描述（如"将水倒入浓硫酸"）误报「遗漏高危关键词」。
_DIRECTION_AUX = {"倒入"}


# 安全相关领域词：用于判断输入是否属于"实验操作行为"范畴
DOMAIN_WORDS = [
    # 仅化学实验场景专属词；移除「操作/佩戴/防护/电源/安全/违规/危险/
    # 高温/高压/腐蚀/易燃」等通用安全词，否则非化学输入（安全帽/带电设备）
    # 会被误判为化学领域而越界误报。
    "实验", "试剂", "试管", "烧杯", "酒精灯", "加热", "护目镜",
    "手套", "废液", "浓硫酸", "稀释", "通风橱", "实验服", "冰箱", "气瓶",
]


def _keyword_hits(behavior: str) -> dict:
    """统计各等级关键词命中数。"""
    # 归一化：倒进 ≡ 倒入（化学语境下同义），避免「水入酸」等方向性危险因措辞不同被漏判为低风险
    behavior = behavior.replace("倒进", "倒入")
    hits = {"high": [], "medium": [], "low": []}
    for level, kws in RISK_KEYWORDS.items():
        for kw in kws:
            if kw in behavior:
                # 「直接」需后接危险动作动词才算高危，避免「直接开始/直接操作」被过度升级
                if kw == "直接":
                    pos = behavior.find(kw)
                    tail = behavior[pos + len(kw):]
                    if not any(v in tail for v in _DIRECT_DANGER_VERBS):
                        continue
                hits[level].append(kw)
    # 方向性危险：仅「水被倒入强酸（浓硫酸/浓酸/强酸/盐酸/硝酸/硫酸）」属于高危倾倒；
    # 正确的「将浓硫酸缓慢沿杯壁倒入水中」、以及安全的「将水倒入量筒/烧杯」
    # 都不应被「倒入」误判为高危。
    if "倒入" in behavior:
        pos = behavior.find("倒入")
        tail = behavior[pos + 2:]
        head = behavior[:pos]
        # 被倒入的是「水」（如「将水倒入」「水倒入」）→ 才可能危险
        poured_is_water = head.endswith("水") or "水倒入" in behavior
        # 倒入的目标是强酸（含稀硫酸/稀硝酸等，水入酸会暴沸飞溅）→ 危险
        target_is_acid = any(
            a in tail for a in ("浓硫酸", "浓酸", "强酸", "盐酸", "硝酸", "硫酸")
        )
        if poured_is_water and target_is_acid:
            hits["high"].append("倒入")
        # 否则（如将浓硫酸…倒入水中 / 将水倒入量筒）不计入，视为正确/安全操作
    return hits


def _hazard_covered(kw: str, actor_reply: str) -> bool:
    """判断 Actor 是否已在输出中覆盖该高危概念（概念级，而非字面匹配）。

    不仅匹配字面负向词（未佩戴/直接），也匹配其正向改写或防护用语
    （如「请佩戴护目镜」「缓慢沿壁加入」），避免把正确整改语言误判为遗漏。
    仅当 Actor 对该危险概念「一个相关词都没提」时才视为真正遗漏。
    """
    if not actor_reply:
        return False
    if kw in actor_reply:
        return True
    for p in KEYWORD_POSITIVE.get(kw, []):
        if p in actor_reply:
            return True
    return False


def _keyword_level(behavior: str) -> str:
    hits = _keyword_hits(behavior)
    if hits["high"]:
        return "high"
    if hits["medium"]:
        return "medium"
    return "low"


def _semantic_similarity(text_a: str, text_b: str) -> float:
    """基于 token 交集的 Jaccard 相似度（轻量级语义匹配）。"""
    tokens_a = set(_tokenize(text_a))
    tokens_b = set(_tokenize(text_b))
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union) if union else 0.0


def _ref_based_level(behavior: str, refs: List[dict]) -> str | None:
    """若行为与检索到的条款描述语义高度重合，采纳该条款的风险等级。"""
    order = {"low": 1, "medium": 2, "high": 3}
    best = None
    best_sim = 0.0
    for ref in refs:
        desc = ref.get("description", "")
        if not desc:
            continue
        sim = _semantic_similarity(behavior, desc)
        if sim > best_sim:
            best_sim = sim
            if sim >= 0.15:  # 语义相似度阈值
                lvl = ref.get("level", "medium")
                if best is None or order[lvl] > order[best]:
                    best = lvl
    return best if best_sim >= 0.15 else None


def _is_domain_input(behavior: str) -> bool:
    """判断输入是否属于安全操作领域（避免对无关输入硬套风险）。"""
    return any(w in behavior for w in DOMAIN_WORDS)


# 安全语境词：步骤明显在「规避危险 / 正确执行」时，不应判为高危。
# 用「防护动作 / 正确装备」概念而非孤立安全短语，使自然描述的正确操作也能稳定降级。
# 含否定前缀（未/不/没/没有/切勿/禁止/严禁/别/无）的动词不算安全动作（见下方否定检测）。
# 以下额外收录「已正确执行某危险动作」的动词（检查/验纯/加沸石/冷却/水封/撒砂土/润洗/平视/通冷凝水…）：
# RAG 的 TF-IDF 无法区分“未X”与其否定“先X/已X”，会把正确操作误配到否定性高危条款；
# 这类正确执行动词能让 _safe_context_override 把其降回低风险，而“未X”因前接否定词不触发降级。
_SAFE_VERBS = [
    "佩戴", "戴好", "穿戴", "防护", "关闭", "关好", "熄灭", "断开", "切断",
    "通风橱", "移液枪", "沿杯壁", "沿器壁", "确认无", "已确认",
    "清理", "盖好", "按规范", "遵守", "撤离",
    "已佩戴", "已关闭", "已断开", "已盖", "已通风", "合格",
    # —— 已正确执行类（防 RAG 把“先X/已X”误配到“未X”否定条款）——
    "检查", "验纯", "加沸石", "加碎瓷片", "预热", "冷却", "水封", "浸没",
    "煤油", "撒砂土", "润洗", "平视", "通冷凝水", "先通水",
    # 正确逆命题（RAG 易把“正确操作”误配到“错误命题”条款）：
    "刻度线水平", "凹液面",          # 定容视线与刻度线水平（vs 仰视/俯视）
    "立即用大量水", "立即冲洗",       # 皮肤沾到立即用大量水冲（vs 未立即冲洗）
    "不超过",                        # 液体不超过1/3并移动（vs 超过1/3）
]
# 不可被安全语境覆盖的「明确危险动作」短语。
# 注意：只收录“正确操作绝不会出现的危险动作短语”；凡是可能被正确语境
# 包裹的裸词（如“明火”会被“确认无明火”包含、“沸石”会被“已加沸石”包含、
# “气密性”会被“检查气密性”包含、“验纯”会被“先验纯”包含、“防毒面具”会被
# “佩戴防毒面具”包含）一律不收录，避免误伤正确操作。这里收录的短语或带“未/不”
# 否定、或含完整危险动作，正确操作不会与之子串重合。
_HARD_DANGER = [
    # —— 原有 ——
    "倒入浓硫酸", "水倒入浓硫酸", "将水倒入浓硫酸",
    "未佩戴", "未戴", "没佩戴", "没有佩戴", "不佩戴", "不戴",
    "未穿", "没穿", "没有穿", "不穿",
    "未戴手套", "没戴手套", "没有戴手套", "不戴手套",
    "未断电", "没断电", "没有断电", "不断电",
    "带电", "明火加热", "嘴吸", "倒回", "裸手", "徒手", "违规操作", "违规",
    "直接倒入", "直接打开", "溅到", "溅入", "溅出", "灼伤", "烫伤", "腐蚀",
    # —— 增补（与 RISK_KEYWORDS 高危/中危动作一一对应）——
    # 试剂 / 废液
    "水加入浓硫酸", "水加进浓硫酸",
    "用嘴吸", "用嘴吸取",
    "骤冷炸裂",
    "混放", "氧化剂混放", "易燃物混放",
    "钠遇水", "钾遇水", "活泼金属遇水", "遇水剧烈",
    "白磷暴露", "白磷露置", "白磷自燃",
    "湿手", "湿手触摸", "湿手摸",
    "密闭容器加热", "封口试管加热", "密闭加热",
    "蒸干", "蒸至干", "蒸干烧瓶",
    "尾气直排", "有毒尾气", "产生有毒气体",
    "未验纯",
    "未加沸石", "忘加沸石", "导致暴沸", "引发暴沸",
    "先熄灭酒精灯", "先灭灯", "先熄灯", "倒吸",
    "未液封", "未插液面",
    "未通冷凝水", "未先通冷凝", "先加热未通水",
    "未标定", "未经标定",
    "酸碱混合", "强酸强碱", "废液未中和",
    "废液混合", "性质不明", "混合废液",
    "未冷却", "未冷至室温", "趁热定容", "热溶液定容",
    "待测液润洗", "用待测液润洗", "润洗锥形瓶",
    "未润洗", "滴定管未润洗",
    "未赶气泡", "未排气泡", "尖嘴气泡",
    "俯视", "仰视", "俯视刻度", "仰视刻度",
    "未预热", "未先预热",
    "量筒加热", "量杯加热", "量器加热",
    "燃着酒精灯", "去点燃", "用酒精灯点",
    "佩戴隐形眼镜",
    "伸入瓶内", "滴管伸入", "移液管伸入",
    "未洗手", "结束未洗手",
    "试管口朝向人", "朝向人", "试管口朝人", "对准人", "对着人",
    "通风橱外", "橱外",
    "废液倒入下水道", "倒下水道", "向下水道",
    "饮食", "进食", "餐具", "吃喝",
    "未立即冲洗", "未用水冲洗", "沾到未冲", "溅到未", "溅到后未",
    "钠着火用水", "金属火用水", "着火用水灭", "钾着火用水",
    "未戴防毒面具", "未戴呼吸防护",
    "未检查气密性", "未检漏", "未查气密",
    "未关闭酒精灯", "未熄灭",
    "鼻子凑近", "凑近瓶口", "直接闻", "凑近闻",
    "未穿实验服", "未扎长发", "未穿实验",
    "标签模糊", "标签不清",
    "不相容试剂", "同台摆放", "混摆",
    "有裂缝", "有裂痕",
    "倒回原瓶",
    "冰箱食品", "冰箱放", "冰箱存放食物",
    "进出水接反", "冷凝管接反",
    "未洗涤", "未洗烧杯", "未洗玻璃棒",
    "手直接拿取", "直接拿取", "手摸试剂",
    "未分类", "废弃物混",
    "试管口未向下", "未向下倾斜", "固体加热未倾斜",
    "奔跑", "追逐", "打闹", "奔跑打闹",
    "直接放天平", "称量盘", "直接称量",
    "超量加热", "液体超过", "试管液体过多",
    "同台堆放", "无隔离", "堆放",
    "滴定管活塞漏液",
    "滴定过快", "滴定速度过快",
    "剧烈摇动", "锥形瓶溅出",
    "电石", "加料过快",
    "真空蒸馏", "未查承压",
    "容量瓶溶解", "直接溶解固体",
    "玻璃棒未靠", "未靠内壁",
    "量筒配制", "量筒配",
    "易水解", "未加酸",
    "制毒气", "制取有毒", "氯气尾气", "硫化氢",
    "未水浴", "直接明火加热",
    "试剂瓶直接加热", "直接置于热源",
    "温度计搅拌", "温度计代搅拌",
]


# —— 否定/禁止句式与正确方向/去向识别（诚实性补强）——
# 背景：RAG(_ref_based_level) 与「水入酸」方向性检测只认关键词共现，无法区分
# 「禁止把水倒进浓硫酸」（规则陈述）与「把水倒进浓硫酸」（真实危险动作），
# 也无法区分「将浓硫酸倒入水中」（正确稀释）与「将水倒入浓硫酸」（错误倾倒）。
# 这两类误判会让安全/正确表述被配具体事故后果，违背「唯一事实源、不吹过头」原则。
# 故在 _safe_context_override 中优先降级：否定/禁止陈述、正确方向/去向操作 → low。

_PROHIBIT_WORDS = (
    "禁止", "严禁", "切勿", "绝不可", "绝对不", "千万不能", "不可",
    "不可以", "不能", "别", "勿", "不要", "不许", "不让", "不应", "不得",
)

# 「未/没 + 防护动作」是真实危险（没戴护目镜、未断电…），即便巧合含禁止词也不降级
_OMISSION_RE = re.compile(r"(未|没|没有|无)(戴|穿|佩戴|戴护目镜|穿实验服|断电|关闭|熄灭|验纯|查气密|洗手|盖)")


def _is_prohibition_statement(behavior: str) -> bool:
    """步骤为「告诫/禁止他人做某事」的规则陈述（如"我不可以把水倒进浓硫酸"），
    而非正在执行危险动作 → 应判低风险。仅当显式禁止词 + 实验领域 + 非「遗漏防护」时成立，
    避免把"未戴护目镜"等真实危险也降级。"""
    b = behavior.replace("倒进", "倒入")
    if not any(p in b for p in _PROHIBIT_WORDS):
        return False
    if not _is_domain_input(b):
        return False
    if _OMISSION_RE.search(b):
        return False
    return True


def _is_correct_safe_operation(behavior: str) -> bool:
    """步骤本身是正确/安全的执行（而非危险动作），应判低风险：
    1) 正确稀释方向：浓硫酸先出现、倒入后出现、水在倒入之后（酸入水）；
    2) 正确废液去向：废液/试剂倒入指定/回收容器，且无危险去向（下水道等）。"""
    b = behavior.replace("倒进", "倒入")
    # 1) 正确稀释：酸入水（含显式安全标志）
    _SAFE_DILUTION_HINTS = ("酸入水", "沿杯壁", "沿器壁", "缓慢加入水中",
                            "缓缓注入水中", "将酸加入水中", "沿杯壁加入")
    if any(s in b for s in _SAFE_DILUTION_HINTS):
        return True
    _ACID = ("浓硫酸", "浓酸", "强酸", "盐酸", "硝酸", "硫酸")
    _POUR = ("倒入", "加入", "加进", "注入", "倒进")
    for a in _ACID:
        ai = b.find(a)
        if ai == -1:
            continue
        for pv in _POUR:
            pi = b.find(pv)
            if pi == -1:
                continue
            if ai < pi and "水" in b[pi + len(pv):]:
                # 酸在倾倒动词之前、水在之后 → 酸入水（正确稀释）
                return True
    # 2) 正确废液/试剂去向
    if any(k in b for k in ("废液", "液体", "试剂", "残液")) and any(
        d in b for d in ("倒入", "倒进", "排入", "放入", "收集到", "回收到", "回收")
    ):
        _SAFE_DEST = ("废液桶", "指定容器", "指定废液缸", "回收瓶", "回收桶",
                      "废液缸", "专用容器", "回收", "收集瓶", "废液收集", "废液桶里")
        _BAD_DEST = ("下水道", "水槽", "厕所", "河流", "地沟", "阴沟",
                     "排水", "洗手池", "马桶", "雨水")
        if any(s in b for s in _SAFE_DEST) and not any(x in b for x in _BAD_DEST):
            return True
    return False


def _safe_context_override(behavior: str, level: str) -> str:
    """安全语境修正：当步骤明显在规避/正确执行危险动作时，降级为低风险。

    用于消除误报（如「关闭酒精灯并确认无明火」被「明火」关键词、
    「将浓硫酸缓慢沿杯壁倒入水中」被「倒入」误判为高危）。
    仅当步骤不含明确危险动作短语时才降级，避免漏判真实危险。

    判定顺序（与诚实性/不漏判双目标一致）：
    1) 禁止/告诫陈述 → 降级（意图非执行危险动作，优先级最高，即便字面含危险短语）；
    2) 含 _HARD_DANGER 明确危险动作短语 → 绝不降级（防「戴好护目镜但用嘴吸」被 PPE 误降）；
    3) 正确安全操作（方向/去向/结构化槽位判定）→ 降级；
    4) 安全动词兜底（_SAFE_VERBS）。
    """
    if level not in ("high", "medium"):
        return level
    # —— 1) 禁止/告诫陈述优先降级为低风险（诚实性补强，见 _is_prohibition_statement）——
    if _is_prohibition_statement(behavior):
        return "low"
    # —— 2) 含明确危险动作短语 -> 不降级（以硬规则为准，防正确操作里夹带真实危险被误降）——
    if any(d in behavior for d in _HARD_DANGER):
        return level
    # —— 3) 正确安全操作（方向/去向）或结构化槽位判定为正确/禁止 -> 降级（方案2）——
    if _is_correct_safe_operation(behavior) or classify_safety(behavior)["intent"] in ("correct_safe", "prohibition"):
        return "low"
    # 存在正向防护动作且无硬危险 -> 降级为低风险。
    # 注意：防护词若被否定则不是安全动作，不能降级。否定词未必紧贴防护词
    # （如"未用待装液润洗""忘记加沸石"），故向前扫描一个窗口（WIN 字）内
    # 是否出现任意否定词来判断，避免把"未X/忘记X"误判为安全执行。
    NEG_WORDS = ("没有", "没", "未", "不", "别", "无", "切勿", "禁止", "严禁",
                 "忘记", "忽略", "省略", "无需", "无须", "未用", "未戴", "未穿")
    WIN = 12
    for v in _SAFE_VERBS:
        idx = behavior.find(v)
        while idx != -1:
            window = behavior[max(0, idx - WIN):idx]
            negated = any(n in window for n in NEG_WORDS)
            if not negated:
                return "low"
            idx = behavior.find(v, idx + 1)
    return level


def _safe_format(template: str, **kwargs) -> str:
    """对 DB/默认模板做安全占位符填充，避免模板含非占位符花括号时整个推断崩溃。

    - 优先用 str.format（标准占位符 {behavior}/{scene_type}/{refs} 时正常）；
    - 若模板被人工改动、含未转义花括号或占位符不匹配导致 format 抛错，
      退化为逐占位符 replace，保证 infer 流程不中断、只丢失个别花括号上下文。
    """
    try:
        return template.format(**kwargs)
    except (KeyError, IndexError, ValueError):
        out = template
        for k, v in kwargs.items():
            out = out.replace("{" + k + "}", str(v))
        return out


def _consequence_text(behavior: str, level: str, hits: dict, refs: List[dict]) -> str:
    """根据命中的风险点生成具体后果描述。

    优先从 risk_outcomes 映射表中取该风险点的标准后果，保证不同入口
    （规则引擎 / LLM 旁白 / AI 自检）看到一致、具体、可执行的描述；
    无精确映射时回退到基于等级的轻量模板。
    """
    if level == "none":
        return (
            f"「{behavior}」未识别到明确的安全违规行为或风险操作。"
            "如确实涉及实验/作业安全，请补充操作细节（如是否佩戴防护、是否断电、涉及何种试剂/设备等），"
            "以便进行精准的风险推演。"
        )

    # 仅 high/medium 风险才返回具体（危险）后果，守诚实边界：
    # 低风险/无风险步骤不配具体事故后果，避免「低风险却说严重灼伤」的矛盾。
    if level in ("high", "medium"):
        # 优先按命中的风险点 description 取具体后果
        for ref in refs:
            outcome = get_risk_outcome(ref.get("description", ""))
            if outcome:
                return str(outcome["consequence"])
        # 精确映射未命中：用模糊匹配兜底（近似描述也能拿到具体后果，而非通用套话）
        fuzzy = match_risk_outcome(behavior)
        if fuzzy:
            return str(fuzzy["consequence"])

    # 无精确映射时的轻量回退
    hit_kws = (hits["high"] + hits["medium"])[:3]
    kw_part = f"（命中风险词：{'、'.join(hit_kws)}）" if hit_kws else ""
    if level == "high":
        return (
            f"「{behavior}」属于高危违规操作{kw_part}：可能直接引发人身伤害、设备损毁或环境污染。"
        )
    if level == "medium":
        return (
            f"「{behavior}」存在一定安全隐患{kw_part}：若不纠正，可能发展为事故或导致实验数据失真。"
        )
    return f"「{behavior}」整体风险较低{kw_part}，但仍需按规程规范执行，防止麻痹大意。"


def _correction_text(behavior: str, level: str, hits: dict, refs: List[dict]) -> str:
    """根据命中的风险点生成针对性纠错步骤。

    优先从 risk_outcomes 映射表中取该风险点的标准整改方案；
    无精确映射时使用通用安全四步作为兜底。纠正步骤中不再重复罗列条款，
    条款由 evidence['matched_clauses'] 单独展示。
    """
    if level == "none":
        return (
            "1. 当前输入未识别到需纠正的风险操作；\n"
            "2. 如需进行安全推演，请描述具体操作行为（如：加热试管时试管口朝向人）；\n"
            "3. 可参考下方示例或切换场景模式后重试。"
        )

    # 仅 high/medium 风险才返回具体整改步骤，守诚实边界（与 consequence 同口径）
    if level in ("high", "medium"):
        for ref in refs:
            outcome = get_risk_outcome(ref.get("description", ""))
            if outcome:
                steps = list(outcome.get("correction_steps", []))
                if steps:
                    # 统一用 1. 2. 3. 编号
                    return "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))
        # 精确映射未命中：用模糊匹配兜底，拿到针对性整改步骤
        fuzzy = match_risk_outcome(behavior)
        if fuzzy:
            steps = list(fuzzy.get("correction_steps", []))
            if steps:
                return "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))

    lines = [
        "1. 立即停止当前操作，回到安全状态；",
        "2. 重新阅读对应安全规程，确认正确步骤；",
        "3. 按规程穿戴/检查必要防护用品后再作业；",
        "4. 完成操作后复查现场，确认无遗留隐患。",
    ]
    if hits["high"]:
        lines.insert(0, f"⚠️ 重点纠正：检测到高危行为特征（{'、'.join(hits['high'][:3])}），必须立即整改。")
    return "\n".join(lines)


# ============================================================
# Critic 校验引擎
# ============================================================

def _critic_validate(
    behavior: str,
    actor_reply: str,
    refs: List[dict],
    rule_level: str,
    rule_score: float,
    consequence: str = "",
) -> tuple[int, str]:
    """Critic 多维度校验 Actor 输出。

    校验维度：
    1. 风险等级一致性：Actor 判定的等级是否与规则引擎一致
    2. 条款溯源准确性：Actor 引用的条款是否来自 RAG 检索结果（防幻觉）
    3. 关键词覆盖度：Actor 是否遗漏了行为中的高危关键词
    4. 后果一致性：Actor 旁白是否严重偏离规则引擎给出的标准后果

    返回 (ai_checked, critic_summary)
    - ai_checked=1 表示通过，0 表示需修正
    """
    issues = []

    # 维度1：提取 Actor 输出中的风险等级关键词
    actor_level = None
    level_patterns = {
        "high": [r"高危", r"高风险", r"等级[:：]?\s*高", r"红色"],
        "medium": [r"中危", r"中风险", r"等级[:：]?\s*中", r"黄色"],
        "low": [r"低危", r"低风险", r"等级[:：]?\s*低", r"绿色"],
    }
    for lvl, patterns in level_patterns.items():
        for pat in patterns:
            if re.search(pat, actor_reply):
                actor_level = lvl
                break
        if actor_level:
            break

    if actor_level and rule_level != "none":
        order = {"low": 1, "medium": 2, "high": 3}
        if abs(order.get(actor_level, 0) - order.get(rule_level, 0)) >= 2:
            issues.append(
                f"风险等级判定偏差较大：Actor 判定为「{actor_level}」，"
                f"规则引擎判定为「{rule_level}」（分数 {rule_score}）"
            )

    # 维度2：检查 Actor 引用的条款是否来自 RAG 检索结果
    if refs:
        ref_clauses = [r.get("clause_ref", "") for r in refs]
        # 检查 Actor 输出是否包含虚构的条款引用
        clause_mentions = re.findall(r"《[^》]+》", actor_reply)
        for mention in clause_mentions:
            # 检查是否在真实条款中出现（允许部分匹配）
            found = any(mention in clause or clause in mention for clause in ref_clauses)
            if not found and len(mention) > 4:
                # 检查是否是常见法规名称（允许的合理引用）
                common_refs = ["高校实验室安全", "化学实验室", "消防安全",
                               "实验室危险废物", "化学试剂", "危险化学品"]
                if not any(cr in mention for cr in common_refs):
                    issues.append(f"可能存在虚构条款引用：{mention}（未在检索到的规范中找到对应条款）")

    # 维度3：检查 Actor 是否遗漏高危关键词（概念级覆盖，避免负向词改写误报）。
    # 例外：若 actor_reply 就是规则引擎标准后果的复述，则已代表规则事实源，
    # 不再要求它逐字覆盖 behavior 中的高危关键词，避免把标准答案误报为漏覆盖。
    hits = _keyword_hits(behavior)
    is_rephrased_consequence = False
    if consequence:
        if actor_reply == consequence:
            is_rephrased_consequence = True
        elif actor_reply:
            sim = _semantic_similarity(actor_reply, consequence)
            if sim >= 0.5:
                is_rephrased_consequence = True
    if hits["high"] and not is_rephrased_consequence:
        missed = [kw for kw in hits["high"]
                  if kw not in _DIRECTION_AUX and not _hazard_covered(kw, actor_reply)]
        if missed:
            issues.append(f"Actor 可能遗漏了高危关键词：{'、'.join(missed[:3])}")

    # 维度4：后果一致性。旁白必须与规则引擎标准后果在核心事实上保持一致，
    # 防止 LLM 自行编造另一种事故场景或弱化关键风险。
    if consequence and actor_reply and actor_reply != "（无需补充）":
        sim = _semantic_similarity(actor_reply, consequence)
        if sim < 0.10:
            issues.append(
                f"旁白严重偏离规则标准后果（语义重合度 {sim:.2f}），"
                f"规则后果为：{consequence[:60]}..."
            )

    if issues:
        summary = "Critic 校验发现以下问题：\n" + "\n".join(f"  - {iss}" for iss in issues)
        return 0, summary
    else:
        checks = [
            "风险等级与规则引擎一致" if rule_level == "none" or actor_level == rule_level or not actor_level else f"等级存在差异但偏差可控（Actor:{actor_level}/Rule:{rule_level}）",
            "条款引用均在检索结果范围内" if refs else "无条款检索结果，跳过溯源校验",
            "高危关键词覆盖完整" if not hits["high"] else f"已覆盖 {len(hits['high'])} 个高危关键词",
            "推演后果与规则标准一致" if consequence and actor_reply and actor_reply != "（无需补充）" else "规则引擎标准后果已生成",
        ]
        return 1, "Critic 校验通过：\n" + "\n".join(f"  ✓ {c}" for c in checks)


def _compute_confidence(level: str, hits: dict, refs: List[dict], ref_level: str | None) -> float:
    """返回 0~1 的判定置信度，用于对外「可解释地说明为什么这么判」。

    信号来源（均为确定性规则产出，不依赖 LLM）：
    - 命中风险关键词的数量与等级
    - RAG 检索到的条款语义匹配强度（match_score）
    - 关键词信号与 RAG 语义信号是否指向同一等级（多信号一致加成）
    """
    if level == "none":
        # 负向判定（领域外输入）：我们相对确信它不在风险范畴，给出中等偏高置信。
        return 0.55
    kw_high_n = len(hits["high"])
    kw_med_n = len(hits["medium"])
    kw_low_n = len(hits["low"])
    top_match = max((r.get("match_score", 0.0) for r in refs), default=0.0)

    c = 0.45  # 规则引擎确定性底线
    c += 0.12 * min(kw_high_n, 3)
    c += 0.07 * min(kw_med_n, 3)
    c += 0.05 * min(kw_low_n, 2)
    c += 0.12 * min(top_match / 0.5, 1.0)  # RAG 语义匹配归一化到 0~0.12
    # 多信号一致加成：关键词等级与 RAG 语义等级都指向当前 level
    if (kw_high_n > 0 and ref_level == "high") or (ref_level == level and top_match >= 0.2):
        c += 0.10
    elif ref_level and ref_level == level:
        c += 0.05
    return max(0.0, min(1.0, c))


def _build_evidence(behavior: str, hits: dict, refs: List[dict], ref_level: str | None,
                    is_domain: bool) -> dict:
    """组装可解释的证据链，前端据此展示「判定依据」。"""
    return {
        "domain_input": is_domain,
        "keyword_hits": {
            "high": hits["high"],
            "medium": hits["medium"],
            "low": hits["low"],
        },
        "matched_clauses": [
            {"clause_ref": r.get("clause_ref", ""), "match_score": r.get("match_score", 0)}
            for r in refs
        ],
        "semantic_level": ref_level,  # RAG 语义推断出的风险等级
        "signal_count": (1 if hits["high"] else 0) + (1 if hits["medium"] else 0)
                        + (1 if refs else 0),
    }


def _sanitize_clause_refs(text: str, refs: List[dict]) -> str:
    """剔除 LLM 输出中虚构的《书名号》条款引用，仅保留检索到的真实条款。

    千问等模型常自创《实验安全日志》《XX制度》等不存在的规范名称，
    既污染旁白又会被 Critic 判为「虚构条款」。本函数在文本进 Critic / 前端前
    把任何不在 refs[].clause_ref 中出现的《书名号》整体删除（含书名号），
    从源头杜绝幻觉条款外泄。真实条款（子串出现在 clause_ref 中）则保留。
    """
    if not text:
        return text
    ref_clauses = [r.get("clause_ref", "") for r in refs]

    def repl(m):
        mention = m.group(0)
        found = any(mention in c or c in mention for c in ref_clauses)
        # 命中真实条款 -> 保留；否则整个《...》删除，避免残留空书名号或孤立连接词。
        return mention if found else ""

    cleaned = re.sub(r"《[^》]+》", repl, text)
    # 删除因剔除造成的孤立连接符（"及《》、""和《》、"等情况）
    cleaned = re.sub(r"[、，,。；;]\s*$", "", cleaned)
    cleaned = re.sub(r"(\s*(及|和|与|以及)\s*)《》", "", cleaned)
    cleaned = re.sub(r"《》", "", cleaned)
    return cleaned


def _ground_actor_reply(raw: str | None, behavior: str, consequence: str) -> str:
    """把 LLM 生成的旁白「接地」：只允许严格复述规则后果，禁止编造或过度发挥。

    返回空串表示弃用 LLM 输出、回退规则文案（无幻觉）。判定条件：
    1) 模型确实只表示无需补充（去掉标记后无任何实质内容）；
    2) 模型输出与行为/规则后果几乎无任何词重叠 -> 视为离题幻觉；
    3) 包含比喻/夸张等 prompt 明确禁止的修辞 -> 视为过度发挥；
    4) 严重遗漏标准后果中的关键事实 -> 视为改写核心事实；
    5) 超过 200 字则截断，避免小模型狂输出。
    注意：verdict（风险等级/分数）始终由规则引擎决定，本函数只影响叙事文本。

    关键修正：千问/qwen 常在有效复述后追加「（无需补充）」标记（把 prompt 里的
    "若没有可补充的，只回复「（无需补充）」"误当作结束语）。此时应**剥离标记、保留
    正文**，而非整段丢弃——否则几乎每次都会误判为"无需补充"而降级成规则引擎。
    """
    if not raw:
        return ""
    r = raw.strip()
    # 剥离「无需补充」类标记（支持全/半角括号），保留其前面的实质复述内容。
    for marker in ("（无需补充）", "(无需补充)", "无需补充", "（无需补充）".replace("（", "(").replace("）", ")")):
        r = r.replace(marker, "")
    r = r.strip()
    if not r:
        return ""

    # 1) 离题检测：与 behavior / consequence 无任何 token 重叠则丢弃
    toks = {t for t in (set(_tokenize(behavior)) | set(_tokenize(consequence))) if len(t) >= 2}
    reply_toks = set(_tokenize(r))
    if toks:
        overlap = toks & reply_toks
        if len(overlap) == 0:
            return ""

    # 2) 比喻/夸张检测：prompt 已禁止此类修辞
    metaphor_markers = ("像", "仿佛", "如同", "宛如", "犹如", "好似", "似的", "一样", "小炮弹")
    # 仅当 consequence 本身不含该词，而 reply 出现时视为违规（保留 consequence 中原有表达）
    for m in metaphor_markers:
        if m in r and m not in consequence:
            return ""

    # 3) 关键事实缺失检测：consequence 中的内容词应在 reply 中保留大部分
    # 过滤掉非常用虚词，得到需要保留的关键 token
    stop_words = {
        "可能", "导致", "造成", "引起", "发生", "产生", "如果", "一旦",
        "会", "可", "的", "了", "在", "或", "与", "及", "等", "后",
    }
    key_toks = {t for t in _tokenize(consequence) if len(t) >= 2 and t not in stop_words}
    if key_toks:
        covered = key_toks & reply_toks
        if len(covered) / len(key_toks) < 0.5:
            return ""

    if len(r) > 200:
        r = r[:200].rstrip("，。、；;,. ") + "…"
    return r


class AgentService:
    """双智能体：Actor 生成 → Critic 复核 → 输出自检结果。

    可信化模型（关键）：
    - 确定性规则引擎（关键词 + RAG 语义 + 打分）永远是「真相源」，无论是否启用 Ollama。
    - Ollama 本地模型只是「自然语言解释增强」，其 Critic 意见作为次级意见，
      仅在规则引擎置信度低时才可被采纳，避免本地模型幻觉反向污染高置信判定。
    - 每次推演都附 confidence（置信度）与 evidence（证据链），结果可解释、可审计。
    """

    def __init__(self, db):
        self.db = db

    async def infer(self, behavior: str, scene_type: str = "experiment") -> dict:
        rag = RAGService(self.db)
        refs = rag.search(behavior, scene_type, top_k=3)
        template = get_template(self.db, "student")
        ref_text = "\n".join(f"- {r['clause_ref']}" for r in refs)

        # ===== 0) 关键词命中分析（确定性规则引擎前置）=====
        hits = _keyword_hits(behavior)
        ref_level = _ref_based_level(behavior, refs)
        # 别名硬匹配（search 会把命中条款 match_score 置 1.0）的等级可信，
        # 直接采纳其等级，避免口语化改写下 TF-IDF 相似度偏低把高危条款误判为中/低危。
        if refs and refs[0].get("match_score", 0.0) >= 0.99:
            ref_level = refs[0].get("level", ref_level)
        is_domain = _is_domain_input(behavior)

        # ===== 1) 判定风险等级与分数（确定性规则引擎，永远是真相源）=====
        # 化学域网关：本沙盘仅面向化学实验。只要输入不属于化学领域，
        # 一般判 NONE（通用风险词或无关输入不越界误报）。
        # 但若 RAG 已检索到相关风险条款（且匹配度足够），即便输入未含显式领域词
        # （如"金属钠遇水"这类物质名未列入领域词），也应视为在域，避免误判 NONE。
        out_of_domain = (not is_domain)
        strong_ref = bool(refs) and (refs[0].get("match_score", 0.0) >= 0.08)
        # 关键词命中高危即视为在域：纯口语化危险描述（如"湿手去碰电源""徒手去拿试剂"）
        # 可能既不含领域词、RAG 又只是弱匹配，若单凭域名网关会漏判为 NONE 而放过真实危险。
        # 高危信号取「RISK_KEYWORDS 命中」或「_HARD_DANGER 明确危险动作短语命中」二者之一
        # （_keyword_hits 只遍历 RISK_KEYWORDS，会漏掉落在 _HARD_DANGER 里的明确危险短语，
        #  故这里显式补上 _HARD_DANGER 命中），与 compute_risk_score 的内部逻辑保持一致。
        kw_signal = bool(hits["high"]) or any(d in behavior for d in _HARD_DANGER)
        none_case = out_of_domain and not strong_ref and not kw_signal
        if none_case:
            level = "none"
            score = 8.0
            score_breakdown = none_breakdown()
        else:
            # 透明化打分：compute_risk_score 同时返回总分与可解释评分明细（A3）
            sc = compute_risk_score(behavior, hits, refs, ref_level)
            level = sc["level"]
            score = sc["risk_score"]
            score_breakdown = sc["breakdown"]

        # ===== 1.2) 安全语境修正（与 simulation / scan 一致）=====
        # 正确执行或规避危险动作的步骤（如"关闭酒精灯并确认无明火"）不应判高危。
        # 这条规则此前只接在 scan/simulation 路径，infer 主推演路径漏接，
        # 导致安全操作在聊天入口被误判高危。降级后同步重算分数与一致性字段，
        # 避免「等级 low 但分数 79」的矛盾。_HARD_DANGER / _SAFE_VERBS 已为其兜底，
        # 真实危险动作（如"未佩戴护目镜"）不会被误降级。
        new_level = _safe_context_override(behavior, level)
        downgraded = new_level != level
        if downgraded:
            level = new_level
            _base = {"high": 75.0, "medium": 45.0, "low": 20.0}[level]
            _bonus = min(len(hits.get("high", [])), 4) * 5 + min(len(hits.get("medium", [])), 4) * 4
            _len_bonus = round(min(len(behavior), 30) * 0.2, 1)
            score_breakdown = [
                {"factor": "安全语境修正后基线分", "detail": f"修正为{level}风险", "delta": _base},
                {"factor": "关键词命中加成", "detail": f"高危{len(hits.get('high', []))} 中危{len(hits.get('medium', []))}", "delta": _bonus},
                {"factor": "行为描述长度修正", "detail": f"{min(len(behavior), 30)} 字", "delta": _len_bonus},
            ]
            score = max(5, min(100, round(_base + _bonus + _len_bonus, 1)))

        # ===== 1.5) 先生成规则引擎的「标准答案」：具体后果 + 针对性整改 =====
        # 这些标准答案会喂给 LLM 旁白，使其只作自然语言润色，不编造新后果。
        # 注意：若刚被安全语境降级（downgraded），行为已被判定为安全/合规，
        # 此时 refs 只是被 RAG 误配到的高危条款，绝不能再拿它的危险后果当标准答案，
        # 否则会出现「等级 low、后果却写飞溅灼伤」的矛盾。降级时用空 refs，
        # 走通用低风险文案；原始 refs 仍保留在 evidence / source_refs 供溯源展示。
        _text_refs = [] if downgraded else refs
        consequence = _consequence_text(behavior, level, hits, _text_refs)
        correction = _correction_text(behavior, level, hits, _text_refs)

        # ===== 2) LLM Actor：基于标准答案做自然语言增强 =====
        # 用 _safe_format 而非 str.format：DB 中的 student 模板若被人工改动、含
        # 未转义花括号（如 {、}），str.format 会直接 KeyError 崩掉整个推断；
        # _safe_format 退化为逐占位符替换，保证流程不中断。
        actor_prompt = _safe_format(
            template,
            behavior=behavior,
            scene_type=scene_type,
            refs=ref_text or "暂无检索到相关条款，请基于通用安全常识判断。",
        ) + (
            "\n\n【规则引擎标准答案（唯一事实源，你必须基于此回答，不得偏离）】\n"
            f"风险等级：{level}\n"
            f"标准后果：{consequence}\n"
            f"标准纠错：{correction}\n\n"
            "【你的任务】用 1-2 句中文重新表达「标准后果」，帮助学生理解；要求：\n"
            "1. 必须保留标准后果中的所有关键事实（如出现的关键名词、动词、结果），不得遗漏；\n"
            "2. 语言可稍作流畅化，但禁止使用比喻、夸张或标准后果中没有的新细节（如出现“像、仿佛、如同、似的、一样”等比喻词，或“小炮弹”等夸张说法，将视为不合格）；\n"
            "3. 严禁编造新风险、新事故、新条款或《书名号》引用；\n"
            "4. 若标准后果已经足够清晰，可直接复述，无需发挥。"
            "若没有可补充的，只回复「（无需补充）」"
        )
        # 非阻塞调用 Ollama（线程池 + 并发信号量 + 超时兜底），失败/超时自动降级规则引擎。
        # ENABLE_LLM_NARRATIVE=False 时完全跳过（纯规则叙事，零幻觉）。
        raw_reply = await try_ollama_generate_async(actor_prompt) if settings.ENABLE_LLM_NARRATIVE else None
        # 兜底：剥离 LLM 可能自创的《书名号》虚构条款，避免污染旁白 / 触发 Critic 误报。
        if raw_reply:
            raw_reply = _sanitize_clause_refs(raw_reply, refs)

        # ===== 3) 规则引擎自检（Critic 规则维度，确定性）=====
        ai_checked, critic_summary = _critic_validate(
            behavior, raw_reply or consequence, refs, level, score, consequence
        )

        # ===== 3) 置信度 + 证据链（对外可解释）=====
        confidence = _compute_confidence(level, hits, refs, ref_level)
        evidence = _build_evidence(behavior, hits, refs, ref_level, is_domain)

        # ===== 4) LLM 增强：仅润色解释，Critic 作为次级意见 =====
        # 叙事旁白：用规则后果「接地」本地模型输出，幻觉/离题时回退规则文案
        narrative_reply = _ground_actor_reply(raw_reply, behavior, consequence) if raw_reply else ""
        trust_mode = "llm_enhanced" if narrative_reply else "rule_deterministic"
        verified_by = "rule_engine"
        critic_divergence = False
        critic_reply = None
        if raw_reply:
            verified_by = "rule_engine+llm_critic"
            critic_prompt = (
                "你是校验AI（Critic）。请复核以下AI输出，检查是否存在：\n"
                "1) 漏判风险（行为涉及高危操作但AI未识别）\n"
                "2) 错误解读（对行为的分析有误）\n"
                "3) 无依据断言/幻觉（引用了不存在的条款或编造了后果）\n"
                "输出格式：\n"
                "复核结论：通过/需修正\n"
                "具体说明：（如有问题逐条列出，每条简明扼要；总字数控制在 400 字以内）\n\n"
                f"用户行为：{behavior}\n"
                f"检索到的规范条款：\n{ref_text or '无'}\n"
                f"AI输出：\n{raw_reply}"
            )
            critic_reply = await try_ollama_generate_async(critic_prompt, max_tokens=1024)
            if critic_reply and "需修正" in critic_reply:
                # 关键可信化改动：规则引擎是唯一真相源，LLM Critic 仅作次级（advisory）意见。
                # 本地小模型（qwen2.5:3b）极易把正确或无风险的判定误判为「需修正」，
                # 若允许它把 ai_checked 翻成 0，会产生大量「AI 自检未通过」误报
                # （如 "我今天有点累" / "实验挺简单的" 等本无风险声明的输入都会被判红）。
                # 因此：无论规则置信度高低，critic 的「需修正」一律只标记为「分歧」，
                # 绝不修改 _critic_validate 的确定性结果——ai_checked 为 0 仅当规则发现硬伤。
                critic_divergence = True
                if ai_checked == 1:
                    # 规则已确定性通过，但模型有保留意见 -> 以规则为准，诚实标注分歧。
                    model_label = "千问模型" if settings.AI_PROVIDER == "cloud" else "本地模型"
                    # 去掉 LLM 输出里的结论性前缀，避免和包装文案重复
                    clean_reply = re.sub(r"^复核结论[:：]\s*需修正\s*\n*\s*具体说明[:：]?\s*", "", critic_reply, flags=re.S)
                    critic_summary = (
                        f"规则引擎确定性判定（置信度 {confidence*100:.0f}%）与{model_label}复核存在分歧，"
                        f"已以规则引擎为准。{model_label}意见如下：\n{clean_reply}"
                    )
                # 若 ai_checked 已为 0（规则 critic 发现硬伤：等级不一致/虚构条款/遗漏高危关键词），
                # 保留规则自检的详细结论，仅标注分歧，不由模型覆盖。

        payload = {
            "behavior": behavior,
            "scene_type": scene_type,
            "consequence": consequence,
            "risk_score": score,
            "level": level,
            "correction": correction,
            "score_breakdown": score_breakdown,
            "source_refs": refs,
            "ai_checked": ai_checked,
            "critic_summary": critic_summary,
            "actor_reply": narrative_reply,
            "critic_reply": critic_reply or "",
            "engine": "cloud" if settings.AI_PROVIDER == "cloud" and narrative_reply else ("ollama" if narrative_reply else "rule"),
            "ai_provider": settings.AI_PROVIDER,
            # ===== 新增可信化字段 =====
            "confidence": round(confidence, 3),
            "evidence": evidence,
            "trust_mode": trust_mode,
            "verified_by": verified_by,
            "critic_divergence": critic_divergence,
        }
        return payload
