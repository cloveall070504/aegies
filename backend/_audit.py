# -*- coding: utf-8 -*-
"""方案3：规则库可达性 / 健康度审计（离线）。

用法：
  python _audit.py          连真实库（SessionLocal）生成 Markdown 报告 规则库可达性审计报告.md
  python _audit.py --ci     用内存库跑断言：发现“真过度触发”或“死别名”则退出码 1（供 CI 使用），
                           并写出 ASCII 报告 audit-report.md 作为 CI artifact。

核心逻辑见 app/services/audit_service.py:run_audit。
"""
import sys

sys.path.insert(0, ".")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, SessionLocal
import app.models  # noqa: F401  注册全部模型，确保 create_all 完整
from app.services import rag_service as R
from app.services.audit_service import run_audit
from app.services.rag_service import _PARAPHRASE_ALIASES


def _memory_session():
    """构造内存 SQLite 会话并 seed 内置风险点（CI 用，不碰真实库）。"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    s = S()
    R.RAGService(s).seed_risk_points()
    return s


def _format_markdown(res):
    N = res["N"]
    dups = res["dups"]
    true_over = res["true_over"]
    probe_rows = res["probe_rows"]
    bad_alias = res["bad_alias"]
    by_scene = res["by_scene"]

    L = []
    L.append("# 规则库可达性 / 健康度审计报告（方案3 · 离线）\n")
    L.append("> 审计：复用线上 RAGService + analyze_text 真实分级  |  风险点总数：%d\n" % N)

    L.append("\n## 一、风险点两两近重复检测（余弦 > 0.82 判为疑似重复）\n")
    if dups:
        L.append("发现 %d 对疑似重复：\n" % len(dups))
        for sim, a, b in sorted(dups, reverse=True):
            L.append("- **相似度 %.2f**  `%s`  ↔  `%s`" % (sim, a, b))
    else:
        L.append("未发现高相似度重复项。\n")

    L.append("\n## 二、过度触发探针（用 analyze_text 实测最终等级）\n")
    L.append("用 %d 条正确操作做探针。**检索候选**只是 TF-IDF 最近邻（正常会返回危险规则）；只有**最终判定为 high/medium** 才是真过度触发 bug。\n" % len(probe_rows))
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
        L.append("所有 %d 个别名 target 均存在于库中。\n" % len(_PARAPHRASE_ALIASES))

    L.append("\n## 四、各场景规则厚度\n")
    L.append("\n| 场景 | 规则数 |\n|---|---|")
    for sc, c in sorted(by_scene.items(), key=lambda x: -x[1]):
        L.append("| %s | %d |" % (sc, c))

    return "\n".join(L)


if __name__ == "__main__":
    if "--ci" in sys.argv:
        db = _memory_session()
        res = run_audit(db)
        print("风险点总数:", res["N"])
        print("近重复:", len(res["dups"]), "| 真过度触发:", len(res["true_over"]), "| 死别名:", len(res["bad_alias"]))
        report = _format_markdown(res)
        with open("audit-report.md", "w", encoding="utf-8") as f:
            f.write(report)
        print("报告已写入 audit-report.md")
        if res["true_over"] or res["bad_alias"]:
            print("审计未通过：存在真过度触发或死别名，退出码 1")
            sys.exit(1)
        print("审计通过。")
    else:
        db = SessionLocal()
        R.RAGService(db).seed_risk_points()
        res = run_audit(db)
        report = _format_markdown(res)
        with open("规则库可达性审计报告.md", "w", encoding="utf-8") as f:
            f.write(report)
        print("报告已写入 规则库可达性审计报告.md")
        print("近重复:", len(res["dups"]), "| 真过度触发:", len(res["true_over"]), "| 死别名:", len(res["bad_alias"]))
        db.close()
