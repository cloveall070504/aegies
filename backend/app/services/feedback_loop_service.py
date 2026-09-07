"""数据反哺闭环（反向 RAG 升级 · E 方案）。

把学生对判定的质疑（is_misjudge）与扫描事件回流，聚合成「疑似规则缺口」，
生成待教师审核的规则建议（RiskPoint source=custom reviewed=0），进入既有审核流；
并提供教师可见的统计洞察接口。

设计要点：
- 采集：scan_text 路由每次扫描后调用 record_scan 落库（失败不影响主流程）。
- 反哺：aggregate_misjudgments 用规则引擎关键词统计高频误判模式；
  suggest_risk_points 把高频模式生成待审规则建议（去重后入 risk_points，reviewed=0）。
- 不破坏诚实不变量：仅生成「待审」候选，须经教师审核（既有 /risk-points/{id}/review）才生效。
"""
import json
from collections import Counter
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.operation_record import OperationRecord
from app.models.risk_point import RiskPoint
from app.services.agent_service import _keyword_hits
from app.services import rules_store


def record_scan(
    db: Session,
    user_id: int,
    text: str,
    result: Dict[str, Any],
    scene_id: str = "",
    ai_provider: str = "",
    is_misjudge: int = 0,
    student_feedback: str = "",
) -> OperationRecord:
    """把一次扫描结果落库（采集），供后续反哺分析。"""
    summary = result.get("summary", {})
    if summary.get("high"):
        level = "high"
    elif summary.get("medium"):
        level = "medium"
    elif summary.get("low"):
        level = "low"
    else:
        level = "none"
    total_score = sum(f.get("severity_score", 0) for f in result.get("findings", []))

    rec = OperationRecord(
        user_id=user_id,
        behavior=(text or "")[:1024],
        scene_type=scene_id or "experiment",
        scene_code=scene_id,
        level=level,
        risk_score=float(total_score),
        source_refs=json.dumps(
            [f.get("matched_clauses", []) for f in result.get("findings", [])],
            ensure_ascii=False,
        ),
        ai_provider=ai_provider,
        is_misjudge=is_misjudge,
        student_feedback=student_feedback,
        feedback_status="pending" if is_misjudge else "",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def aggregate_misjudgments(db: Session, min_count: int = 1) -> List[Dict[str, Any]]:
    """聚合被学生标记误判的记录，按命中的风险关键词/硬危险短语统计高频模式。

    同时覆盖 RISK_KEYWORDS 命中与 _HARD_DANGER 硬危险短语（如「用嘴吸」），
    返回按出现次数降序的清单（疑似学生常做且常被判危的动作，提示规则缺口）。
    """
    recs = db.query(OperationRecord).filter(OperationRecord.is_misjudge == 1).all()
    counter: Counter = Counter()
    for r in recs:
        behavior = r.behavior or ""
        hits = _keyword_hits(behavior)
        for kw in (hits["high"] + hits["medium"]):
            counter[kw] += 1
        for d in rules_store.get_hard_danger():
            if d in behavior:
                counter[d] += 1
    return [
        {"keyword": k, "count": c}
        for k, c in counter.most_common(20)
        if c >= min_count
    ]


def suggest_risk_points(db: Session, min_count: int = 2) -> List[Dict[str, Any]]:
    """把高频误判关键词生成待审规则建议（RiskPoint source=custom reviewed=0）。

    仅生成当前 risk_points 表中尚不存在同 description 的候选，避免重复提交；
    生成的候选须经教师审核（/risk-points/{id}/review）才进入检索与生效。
    """
    items = aggregate_misjudgments(db, min_count=min_count)
    existing = {rp.description for rp in db.query(RiskPoint).all()}
    created: List[RiskPoint] = []
    for it in items:
        desc = it["keyword"]
        if desc in existing:
            continue
        rp = RiskPoint(
            scene_id="chem_lab",
            description=desc,
            level="medium",
            weight=0.5,
            clause_ref="",
            vector_id="",
            source="custom",
            reviewed=0,
            owner_id=None,
        )
        db.add(rp)
        created.append(rp)
    db.commit()
    for rp in created:
        db.refresh(rp)
    return [rp.to_dict() for rp in created]


def get_insights(db: Session) -> Dict[str, Any]:
    """教师可见的统计洞察：采集总量、误判数、等级分布、Top 误判关键词。"""
    total = db.query(OperationRecord).count()
    mis = db.query(OperationRecord).filter(OperationRecord.is_misjudge == 1).count()
    by_level = {}
    for lv in ("high", "medium", "low", "none"):
        by_level[lv] = db.query(OperationRecord).filter(OperationRecord.level == lv).count()
    return {
        "total_records": total,
        "misjudge_count": mis,
        "by_level": by_level,
        "top_misjudge_keywords": aggregate_misjudgments(db, min_count=1),
    }
