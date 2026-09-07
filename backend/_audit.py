# -*- coding: utf-8 -*-
"""方案3：规则库可达性/健康度审计（离线，复用真实 RAGService + analyze_text）。"""
import sys
sys.path.insert(0, ".")
from collections import defaultdict
from app.database import SessionLocal
from app.models.risk_point import RiskPoint
from app.services import rag_service as R
from app.services.rag_service import _TfidfIndex, _PARAPHRASE_ALIASES
from app.services.scan_service import analyze_text

db = SessionLocal()
# 重新 seed，使 BUILTIN 中新增/修正的规则进入真实库
R.RAGService(db).seed_risk_points()

rps = db.query(RiskPoint).all()
N = len(rps)
print("风险点总数:", N)

# 1. 两两近重复检测
idx = _TfidfIndex()
idx.build(rps)
vecs = idx._doc_vectors
dups = []
for i in range(N):
    for j in range(i + 1, N):
        sim = sum(vecs[i].get(t, 0) * vecs[j].get(t, 0) for t in vecs[i])
        if sim > 0.82:
            dups.append((round(sim, 3), rps[i].description, rps[j].description))

# 2. 过度触发探针（用 analyze_text 实测最终判定等级，而非仅检索候选）
correct_steps = [
    "稀释浓硫酸时将浓硫酸沿杯壁缓慢注入水中并不断搅拌",
    "点燃氢气前先验纯",
    "加热前先预热再集中加热",
    "闻气体时用手轻轻扇闻",
    "实验结束后废液倒入指定废液缸",
    "取用试剂用药匙或纸槽",
    "蒸馏时先通冷凝水再加热并加沸石",
    "制备气体前先检查装置气密性",
    "滴定管使用前用待装液润洗",
    "容量瓶定容时视线与刻度线水平",
    "皮肤沾到试剂立即用大量水冲洗",
    "加热试管内液体不超过三分之一并不断移动",
    "实验完毕洗手并清理台面",
    "活泼金属钠保存在煤油中",
    "白磷保存在水中",
    "移液管移液前用待吸液润洗",
    "将浓硫酸缓缓倒入水中",
    "废液倒入指定回收容器",
]
true_over = []  # 最终判 high/medium 的正确步骤 = 真过度触发
probe_rows = []
for s in correct_steps:
    res = analyze_text(db, s, scene_id="chem_lab")
    f = res["findings"][0] if res.get("findings") else None
    lvl = f["level"] if f else "none"
    retrieved = R.RAGService(db).search(s, scene_type="experiment", top_k=3)
    cand = [d["description"][:16] for d in retrieved if d.get("level") in ("high", "medium")]
    if lvl in ("high", "medium"):
        true_over.append((s, lvl))
    probe_rows.append((s, lvl, len(cand), cand))

# 3. 别名完整性
desc_set = {rp.description for rp in db.query(RiskPoint).all()}
bad_alias = [a for a, t in _PARAPHRASE_ALIASES.items() if t not in desc_set]

# 4. 场景厚度
by_scene = defaultdict(int)
for rp in rps:
    by_scene[rp.scene_id] += 1

# ===== 报告 =====
L = []
L.append("# 规则库可达性 / 健康度审计报告（方案3 · 离线，已含修复）\n")
L.append("> 审计日期：2026-09-07  |  检索器：复用线上 RAGService + analyze_text 真实分级  |  风险点总数：%d\n" % N)
L.append("\n## 一、风险点两两近重复检测（余弦 > 0.82 判为疑似重复）\n")
if dups:
    L.append("发现 %d 对疑似重复：\n" % len(dups))
    for sim, a, b in sorted(dups, reverse=True):
        L.append("- **相似度 %.2f**  `%s`  ↔  `%s`" % (sim, a, b))
else:
    L.append("未发现高相似度重复项。\n")

L.append("\n## 二、过度触发探针（用 analyze_text 实测最终等级）\n")
L.append("用 %d 条正确操作做探针。**检索候选**只是 TF-IDF 最近邻（正常会返回危险规则）；只有**最终判定为 high/medium** 才是真过度触发 bug。\n" % len(correct_steps))
L.append("\n| 正确步骤 | 最终等级 | 检索危险候选数 | 候选(截断) |\n|---|---|---|---|")
for s, lvl, nc, ds in probe_rows:
    flag = " <<< 真过度触发" if lvl in ("high", "medium") else ""
    L.append("| %s | **%s** | %d | %s |%s" % (s, lvl, nc, "、".join(ds) if ds else "—", flag))
if true_over:
    L.append("\n**真过度触发（需修）**：\n")
    for s, lvl in true_over:
        L.append("- `%s` → 最终等级 %s" % (s, lvl))
else:
    L.append("\n**本轮无真过度触发**：所有正确步骤最终判定为 low/none，诚实边界保持良好。\n")

L.append("\n## 三、别名完整性（指向不存在规则 = 死别名）\n")
if bad_alias:
    L.append("发现 %d 个死别名：\n" % len(bad_alias))
    for a in bad_alias:
        L.append("- `%s` → `%s`" % (a, _PARAPHRASE_ALIASES[a]))
else:
    L.append("所有 %d 个别名 target 均存在于库中（已修复上一版 12 个死别名）。\n" % len(_PARAPHRASE_ALIASES))

L.append("\n## 四、各场景规则厚度\n")
L.append("\n| 场景 | 规则数 |\n|---|---|")
for sc, c in sorted(by_scene.items(), key=lambda x: -x[1]):
    L.append("| %s | %d |" % (sc, c))

L.append("\n## 五、本次修复记录（方案3 落地）\n")
L.append("- 修正 12 个死别名：4 处 `未穿实验服、未扎`→`未穿实验服未扎`（与种子一致）；3 处温度计别名补顿号 `破裂、汞`；3 处酸碱混兑 `把`→`将`。\n")
L.append("- 新增缺失规则 `向燃着的酒精灯内添加酒精`（high），2 个酒精灯别名（往燃着/给点着加酒精）不再悬空。\n")
L.append("- 审计脚本 `_audit.py` 现用 `analyze_text` 实测最终等级，避免把“检索候选”误报为“过度触发”。\n")

L.append("\n## 六、给后续方案的输入\n")
L.append("- 方案1（缺失步骤）：must-do 候选 = 含“须/必须/应/先”强约束且 level>=medium 的条款（加沸石、验纯、查气密性、通冷凝水）。\n")
L.append("- 方案2（槽位匹配）：近重复对与检索候选→最终等级不一致的项是优先重构对象。\n")

report = "\n".join(L)
with open("规则库可达性审计报告.md", "w", encoding="utf-8") as f:
    f.write(report)
print("报告已写入 规则库可达性审计报告.md")
print("近重复:", len(dups), "| 真过度触发:", len(true_over), "| 死别名:", len(bad_alias))
db.close()
