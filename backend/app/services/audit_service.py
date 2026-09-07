# -*- coding: utf-8 -*-
"""方案3：规则库可达性 / 健康度审计核心逻辑（离线，复用真实 RAGService + analyze_text）。

对外暴露 run_audit(db) -> dict，供：
  - _audit.py：开发者手动生成 Markdown 报告 / --ci 模式供 CI 断言；
  - tests/test_audit.py：pytest 覆盖门禁，复用内存库 fixture。

审计四项检查均离线、确定性，不依赖 LLM / 网络 / 真实库：
  1) 两两近重复检测（TF-IDF 余弦 > 0.82 判疑似重复）；
  2) 过度触发探针（一批正确操作若最终被判 high/medium = 真过度触发，诚实性回归）；
  3) 别名完整性（指向不存在规则 = 死别名）；
  4) 各场景规则厚度。
"""
from collections import defaultdict

from app.models.risk_point import RiskPoint
from app.services import rag_service as R
from app.services.rag_service import _PARAPHRASE_ALIASES, _TfidfIndex
from app.services.scan_service import analyze_text

# 过度触发探针：一批“正确操作”，若最终被判 high/medium 即为真过度触发（诚实性回归）。
CORRECT_STEPS_PROBE = [
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

DUP_SIM_THRESHOLD = 0.82


def run_audit(db):
    """对给定（已 seed）会话做四项健康度检查，返回结构化结果。

    返回 dict：
      N, dups[(sim, a, b)...], true_over[(step, lvl)...],
      probe_rows[(step, lvl, n_cand, cand)...], bad_alias[alias...], by_scene{scene:count}
    """
    rps = db.query(RiskPoint).all()
    N = len(rps)

    # 1. 两两近重复检测
    idx = _TfidfIndex()
    idx.build(rps)
    vecs = idx._doc_vectors
    dups = []
    for i in range(N):
        for j in range(i + 1, N):
            sim = sum(vecs[i].get(t, 0) * vecs[j].get(t, 0) for t in vecs[i])
            if sim > DUP_SIM_THRESHOLD:
                dups.append((round(sim, 3), rps[i].description, rps[j].description))

    # 2. 过度触发探针（用 analyze_text 实测最终判定等级，而非仅检索候选）
    true_over = []
    probe_rows = []
    for s in CORRECT_STEPS_PROBE:
        res = analyze_text(db, s, scene_id="chem_lab")
        f = res["findings"][0] if res.get("findings") else None
        lvl = f["level"] if f else "none"
        retrieved = R.RAGService(db).search(s, scene_type="experiment", top_k=3)
        cand = [d["description"][:16] for d in retrieved if d.get("level") in ("high", "medium")]
        if lvl in ("high", "medium"):
            true_over.append((s, lvl))
        probe_rows.append((s, lvl, len(cand), cand))

    # 3. 别名完整性（指向不存在规则 = 死别名）
    desc_set = {rp.description for rp in rps}
    bad_alias = [a for a, t in _PARAPHRASE_ALIASES.items() if t not in desc_set]

    # 4. 场景厚度
    by_scene = defaultdict(int)
    for rp in rps:
        by_scene[rp.scene_id] += 1

    return {
        "N": N,
        "dups": dups,
        "true_over": true_over,
        "probe_rows": probe_rows,
        "bad_alias": bad_alias,
        "by_scene": dict(by_scene),
    }
