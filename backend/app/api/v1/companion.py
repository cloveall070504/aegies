"""数字人对话中枢 —— 自由问答 + 意图识别 + 多轮上下文 + RAG 溯源。

对应《数字人深度融合方案》第 4/5 章：
  * 意图识别是路由器：
      - 操作指令（"我把水倒进浓硫酸里"）→ 规则引擎 AgentService（唯一事实源），
        数字人只负责"念"判定结果，不自己下安全结论；
      - 自由问答（"浓硫酸稀释要注意什么？"）→ RAG 检索风险条款 + LLM 生成，
        答案必须落在检索到的条款上，防止幻觉；
      - 闲聊/情感 → 人设短回复，不涉及安全结论。
  * 多轮上下文：内存会话（每用户每 session 最近 N 轮），供 LLM 理解
    "那第二步呢？""刚才说的再讲讲"这类指代。
  * 全面降级：LLM 不可用时，问答回落到"条款拼接"的确定性回答，
    闲聊回落到预设台词——数字人永远有话说，但绝不编造安全结论。

新增能力：
  * 对话持久化：会话与消息落库，刷新不丢
  * 流式输出：SSE 逐字返回，体感更快
  * 快捷问法：按模块场景动态推荐问题

诚实边界（答辩口径）：
  - 会话上下文存进程内存 + 数据库持久化，单机部署够用；
  - 流式输出仅作用于 LLM 生成环节，规则引擎仍是同步返回（毫秒级，不需流）。
"""
import json
import re
import time
from collections import deque
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.conversation import (
    Conversation,
    ConversationMessage,
    MAX_CONVERSATIONS_PER_USER,
    MAX_MESSAGE_LENGTH,
)
from app.models.user import User
from app.services.agent_service import RISK_KEYWORDS, CONTEXT_KEYWORDS, AgentService
from app.services.rag_service import RAGService, try_ollama_generate_async, try_ollama_generate_stream
from app.utils.response import ok

router = APIRouter(prefix="/companion", tags=["数字人对话"])

# ---------------- 人设 ----------------
PERSONA = (
    "你是「实战避错系统」里的数字人学习陪伴者，面向中学生讲解化学实验安全。"
    "说话风格：亲切、口语化、用大白话，像一位耐心的学姐/学长，称呼对方为「你」。"
    "每次回答控制在 150 字以内，最多 4 句话。"
    "回答专业问题时，只能依据下面给出的《安全条款》，不许编造条款或数据；"
    "条款里没有的内容就诚实说「这个我不确定，建议问老师」。"
)

# ---------------- 意图识别（规则优先，确定性） ----------------
# 疑问词/问句标记 → 自由问答
_QA_MARKERS = re.compile(
    r"[?？]|为什么|怎么|怎样|如何|什么|哪些|区别|作用|用途|能不能|可以吗|行吗|对吗|对不对|好吗|啥|多少|几个|第几"
)
# 许可型提问（"这样能做吗？""可以吗？"）→ 本质是拿操作来要判定，交规则引擎
_PERMISSION_RE = re.compile(r"(能|不能|可以|不可以|可不可以|行不行|敢不敢|要不要)[^。？！]{0,12}(吗|么|不)")
# 动作动词 → 用户在描述一个实验操作（交给规则引擎判定）
_ACTION_VERBS = re.compile(
    "加热|倒入|倒进|加入|加进|稀释|配制|称量|称取|量取|点燃|熄灭|佩戴|戴上|摘下|脱下|"
    "闻|扇闻|搅拌|过滤|蒸发|冷却|冲洗|擦拭|关闭|打开|取出|取用|转移|移液|滴定|滴加|"
    "振荡|摇匀|静置|收集|检验|验纯|检漏|查气密性|中和|回收|倾倒"
)


def detect_intent(text: str) -> str:
    """三分意图：operation（操作指令）/ qa（自由问答）/ chat（闲聊情感）。

    判定顺序（确定性、可解释）：
      1. 含疑问标记 → qa（"溅到眼睛该怎么办"是求急救知识，不是自述操作）；
         例外：许可型提问（"把水倒进浓硫酸可以吗"）虽是问句，本质是拿危险
         操作来要判定，交规则引擎给风险分级更稳 → operation；
      2. 含风险关键词（agent_service 词表）→ operation；
      3. 含动作动词 → operation；
      4. 其余 → chat。
    """
    t = (text or "").strip()
    if not t:
        return "chat"

    all_risk_words = set(RISK_KEYWORDS["high"]) | set(RISK_KEYWORDS["medium"]) | set(RISK_KEYWORDS["low"])

    # 1) 问句标记优先：求知识/求急救 → qa；许可型危险操作提问 → operation
    if _QA_MARKERS.search(t):
        asks_permission = bool(_PERMISSION_RE.search(t))
        mentions_action = any(w in t for w in all_risk_words) or bool(_ACTION_VERBS.search(t))
        if asks_permission and mentions_action:
            return "operation"
        return "qa"

    # 2) 风险动作关键词
    if any(w in t for w in all_risk_words):
        return "operation"

    # 3) 动作动词（排除纯聊天）
    if _ACTION_VERBS.search(t):
        return "operation"

    return "chat"


# ---------------- 会话上下文（内存，最近 N 轮） ----------------
_SESSION_MAX_TURNS = 8
_SESSION_TTL = 3600  # 1 小时无活动即视为过期
_SESSION_MAX = 500   # 最大并发会话数（防内存泄漏，单机足够）
_sessions: dict[str, dict] = {}  # key -> {"turns": deque[(role, text)], "at": ts}
_cleanup_task = None  # type: ignore[assignment]


def _start_cleanup_task():
    """启动后台定时清理任务：每 10 分钟扫一次，清掉过期会话。

    用 asyncio.create_task 在 FastAPI 启动事件里注册，
    避免每次请求都 O(n) 遍历全量 session（请求越多越慢）。
    """
    global _cleanup_task
    if _cleanup_task is not None:
        return
    import asyncio

    async def _cleanup_loop():
        while True:
            await asyncio.sleep(600)  # 每 10 分钟一次
            try:
                _sweep_expired_sessions()
            except Exception:
                pass  # 清理任务自身绝不能崩

    _cleanup_task = asyncio.create_task(_cleanup_loop())


def _sweep_expired_sessions():
    """删除所有过期会话。"""
    now = time.time()
    expired = [k for k, v in _sessions.items() if now - v["at"] > _SESSION_TTL]
    for k in expired:
        _sessions.pop(k, None)


def _session_key(user_id: int, session_id: str) -> str:
    return f"{user_id}:{session_id or 'default'}"


def _evict_if_needed():
    """超过最大会话数时，踢掉最老的（LRU 简化版：按最后活跃时间排序）。

    极端情况下并发用户很多，内存不能无限涨。设一个保守上限 500，
    单机部署够用（学生一般同时在线也就几十到几百）。
    """
    if len(_sessions) < _SESSION_MAX:
        return
    # 按最后活跃时间升序，踢掉最老的 10%，留出余量
    sorted_keys = sorted(_sessions.keys(), key=lambda k: _sessions[k]["at"])
    evict_n = max(1, int(_SESSION_MAX * 0.1))
    for k in sorted_keys[:evict_n]:
        _sessions.pop(k, None)


def _get_history(user_id: int, session_id: str) -> list[tuple[str, str]]:
    key = _session_key(user_id, session_id)
    now = time.time()
    entry = _sessions.get(key)
    if not entry or now - entry["at"] > _SESSION_TTL:
        # 过期就直接删掉，不占位置
        _sessions.pop(key, None)
        return []
    return list(entry["turns"])


def _append_history(user_id: int, session_id: str, role: str, text: str) -> None:
    key = _session_key(user_id, session_id)
    # 新会话加入前先检查容量
    if key not in _sessions:
        _evict_if_needed()
    entry = _sessions.setdefault(key, {"turns": deque(maxlen=_SESSION_MAX_TURNS), "at": 0.0})
    entry["turns"].append((role, text[:400]))
    entry["at"] = time.time()


def _history_prompt(history: list[tuple[str, str]]) -> str:
    if not history:
        return ""
    lines = []
    for role, text in history[-_SESSION_MAX_TURNS:]:
        who = "学生" if role == "user" else "数字人"
        lines.append(f"{who}：{text}")
    return "【最近的对话】\n" + "\n".join(lines) + "\n"


# ---------------- 对话持久化辅助 ----------------

def _get_or_create_conversation(db: Session, user_id: int, session_id: str, module: str = "") -> Conversation:
    """获取或创建会话。超出数量上限时归档最老的。"""
    conv = db.query(Conversation).filter(
        Conversation.user_id == user_id,
        Conversation.session_id == session_id,
    ).first()
    if conv:
        return conv

    # 新会话：先清理超限
    count = db.query(Conversation).filter(Conversation.user_id == user_id).count()
    if count >= MAX_CONVERSATIONS_PER_USER:
        # 按更新时间升序，删最老的一个
        oldest = (
            db.query(Conversation)
            .filter(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.asc())
            .first()
        )
        if oldest:
            db.delete(oldest)
            db.commit()

    conv = Conversation(user_id=user_id, session_id=session_id, module=module)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def _save_message(db: Session, conversation_id: int, role: str, text: str,
                  intent: str = "chat", engine: str = "", level: str = "",
                  risk_score: int = 0, source_count: int = 0,
                  meta: dict | None = None) -> ConversationMessage:
    """保存一条消息到数据库。"""
    msg = ConversationMessage(
        conversation_id=conversation_id,
        role=role,
        text=text[:MAX_MESSAGE_LENGTH],
        intent=intent,
        engine=engine,
        level=level,
        risk_score=risk_score,
        source_count=source_count,
        meta_json=json.dumps(meta or {}, ensure_ascii=False),
    )
    db.add(msg)
    # #8 修复：每条消息落库时，把所属会话的 updated_at 往前刷（标记脏后由 onupdate=func.now() 自动更新），
    # 否则会话列表按 updated_at 排序/淘汰会失效——新消息的会话沉底、超限时反而淘汰了活跃会话。
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conv:
        conv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    return msg


def _update_conversation_title(db: Session, conv: Conversation, first_user_text: str) -> None:
    """用首条用户消息前 20 字做会话标题。"""
    if conv.title != "新对话" or not first_user_text:
        return
    title = first_user_text.strip()[:20]
    if title:
        conv.title = title
        db.commit()


# ---------------- 快捷问法（按模块动态推荐） ----------------
# 每个模块给 4-5 个推荐问题，帮助学生"开口问"。
# 问题按真实场景设计，覆盖操作判定、知识问答、引导探索三类。
_QUICK_QUESTIONS = {
    "": [  # 通用/主页
        "浓硫酸怎么稀释才安全？",
        "实验前要做哪些准备？",
        "溅到眼睛里怎么办？",
        "给我讲个真实事故案例",
    ],
    "避错沙盘": [
        "把水倒进浓硫酸会怎样？",
        "加热试管要注意什么？",
        "用酒精灯直接点燃会爆炸吗？",
        "过滤操作的常见错误",
    ],
    "案例库": [
        "最严重的化学事故是什么？",
        "实验室火灾怎么逃生？",
        "违规操作的典型后果",
        "有没有中学生的真实案例",
    ],
    "个人画像": [
        "我哪些知识点最薄弱？",
        "怎么提升我的安全意识？",
        "给我制定一个学习计划",
        "我的风险等级是多少",
    ],
    "我的作业": [
        "这道题我不会，能讲讲吗？",
        "作业提交后多久出分？",
        "怎么提高作业正确率？",
        "有没有类似的练习题",
    ],
    "学习中心": [
        "化学实验安全分几大类？",
        "危险化学品怎么分类？",
        "急救措施有哪些？",
        "消防器材怎么使用",
    ],
}


def _get_quick_questions(module: str = "") -> list[str]:
    """按模块返回快捷问法，找不到模块时返回通用的。"""
    return _QUICK_QUESTIONS.get(module, _QUICK_QUESTIONS[""])


# ---------------- 兜底台词（LLM 不可用时的降级） ----------------
_CHAT_FALLBACKS = [
    "我在呢～有什么实验安全上的问题尽管问我。",
    "嗯嗯，我听着呢。想聊实验操作的话，我随时给你把关。",
    "咱们还是聊点实验安全吧，比如你可以问我「浓硫酸怎么稀释」。",
    "这个问题有点超出我的范围啦，不过只要是实验安全相关的，我都能帮你。",
]


@router.post("/chat")
async def companion_chat(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """数字人统一对话入口：意图识别 → 分流（规则引擎 / RAG+LLM / 人设）。"""
    text = ((payload or {}).get("text") or "").strip()
    session_id = (payload or {}).get("session_id") or "default"
    module = (payload or {}).get("module") or ""
    scene_ctx = (payload or {}).get("scene_ctx") or ""

    if not text:
        return ok({"intent": "chat", "reply": "你想问什么？可以直接说操作，也可以直接提问。", "engine": "fallback"})

    # 持久化：获取/创建会话
    conv = _get_or_create_conversation(db, user.id, session_id, module)

    intent = detect_intent(text)
    _append_history(user.id, session_id, "user", text)
    _save_message(db, conv.id, "user", text, intent=intent)
    _update_conversation_title(db, conv, text)

    # ---------- 1) 操作指令：规则引擎判定（唯一事实源） ----------
    if intent == "operation":
        result = await AgentService(db).infer(text, "experiment")
        reply = result.get("correction", "") or result.get("consequence", "")
        _append_history(user.id, session_id, "ai", reply)
        _save_message(
            db, conv.id, "ai", reply,
            intent="operation", engine="rule",
            level=result.get("level", ""),
            risk_score=result.get("risk_score", 0),
            source_count=len(result.get("source_refs") or []),
            meta={"consequence": result.get("consequence", ""), "correction": result.get("correction", "")},
        )
        return ok({
            "intent": "operation",
            "level": result["level"],
            "risk_score": result["risk_score"],
            "consequence": result["consequence"],
            "correction": result["correction"],
            "source_count": len(result.get("source_refs") or []),
            "engine": "rule",
            "module": module,
            "message_id": conv.id,
        })

    # ---------- 2) 自由问答：RAG 检索 + LLM 生成（答案落在条款上） ----------
    if intent == "qa":
        hits = await run_in_threadpool(RAGService(db).search, text, "experiment", top_k=3)
        if hits:
            lines = [
                f"{i + 1}. [{h.get('level', 'low')}] {h.get('description', '')}（依据：{h.get('clause_ref', '')}）"
                for i, h in enumerate(hits)
            ]
            clauses_text = "【安全条款（唯一事实源，回答必须以此为准）】\n" + "\n".join(lines) + "\n"
        else:
            # 诚实边界：条款没覆盖时，允许讲通用急救/常识，但必须降信心并引导找老师，
            # 且禁止编造规程编号——避免"无据自信"。
            clauses_text = (
                "【注意】本问题未检索到直接对应的安全条款。如涉及急救或通用常识可以谨慎回答，"
                "但必须：1) 提醒以指导老师/医护人员意见为准；2) 不得编造任何规程编号或数据。\n"
            )

        prompt = (
            f"{PERSONA}\n\n"
            f"{clauses_text}"
            f"{_history_prompt(_get_history(user.id, session_id))}"
            + (f"【当前场景】学生正在使用{module}模块。{scene_ctx}\n" if module or scene_ctx else "")
            + f"【学生的问题】{text}\n"
            + "请基于条款用大白话回答，并在最后用一句话点出最关键的注意事项。"
        )
        reply = await try_ollama_generate_async(prompt, max_tokens=420)

        if reply:
            engine = "llm"
        elif hits:
            # 降级 1：LLM 不可用 → 用检索到的条款拼一段确定性回答
            # （RiskPoint 只有"禁止/错误行为"描述 + 条款溯源，没有纠错字段，
            #  所以只念条款本身，不编"正确做法"，保持可审计。）
            top = hits[0]
            reply = (
                f"关于这个问题，规程里是这么说的：{top.get('description', '')}。"
                f" 依据条款：{top.get('clause_ref', '')}。"
                "更细的正确步骤，可以把你的操作放到避错沙盘里推演，我一步步讲给你。"
            )
            engine = "rag"
        else:
            reply = "这个我暂时没找到对应的安全条款，不敢乱说。建议你把具体操作放到避错沙盘里推演一下，或者问问老师。"
            engine = "fallback"

        _append_history(user.id, session_id, "ai", reply)
        _save_message(
            db, conv.id, "ai", reply,
            intent="qa", engine=engine,
            source_count=len(hits),
            meta={"sources": [
                {"description": h.get("description", ""), "clause_ref": h.get("clause_ref", ""), "level": h.get("level", "low")}
                for h in hits
            ]},
        )
        return ok({
            "intent": "qa",
            "reply": reply,
            "engine": engine,
            "sources": [
                {"description": h.get("description", ""), "clause_ref": h.get("clause_ref", ""), "level": h.get("level", "low")}
                for h in hits
            ],
            "module": module,
        })

    # ---------- 3) 闲聊/情感：人设短回复 ----------
    prompt = (
        f"{PERSONA}\n\n"
        f"{_history_prompt(_get_history(user.id, session_id))}"
        + (f"【当前场景】学生正在使用{module}模块。\n" if module else "")
        + f"【学生说】{text}\n"
        + "学生这句不是在问安全问题，请以陪伴者的口吻自然回应一两句，"
          "可以顺势引导他去做一次推演或看看案例，但不要硬广。"
    )
    reply = await try_ollama_generate_async(prompt, max_tokens=200)
    if not reply:
        reply = _CHAT_FALLBACKS[len(_sessions.get(_session_key(user.id, session_id), {}).get("turns", [])) % len(_CHAT_FALLBACKS)]
        engine = "fallback"
    else:
        engine = "llm"

    _append_history(user.id, session_id, "ai", reply)
    _save_message(db, conv.id, "ai", reply, intent="chat", engine=engine)
    return ok({"intent": "chat", "reply": reply, "engine": engine, "module": module})


# ---------------- 会话管理 ----------------

@router.get("/conversations")
def list_conversations(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的会话列表（按更新时间倒序）。"""
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return ok([c.to_dict() for c in convs])


@router.get("/conversations/{session_id}/messages")
def get_conversation_messages(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取指定会话的所有消息。"""
    conv = db.query(Conversation).filter(
        Conversation.user_id == user.id,
        Conversation.session_id == session_id,
    ).first()
    if not conv:
        return ok([])
    msgs = db.query(ConversationMessage).filter(
        ConversationMessage.conversation_id == conv.id,
    ).order_by(ConversationMessage.id.asc()).all()
    return ok([m.to_dict() for m in msgs])


@router.delete("/conversations/{session_id}")
def delete_conversation(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除指定会话及其所有消息。"""
    conv = db.query(Conversation).filter(
        Conversation.user_id == user.id,
        Conversation.session_id == session_id,
    ).first()
    if conv:
        db.delete(conv)
        db.commit()
    return ok({"deleted": True})


# ---------------- 快捷问法 ----------------

@router.get("/quick-questions")
def quick_questions(module: str = ""):
    """按模块返回快捷推荐问题。"""
    return ok({
        "module": module,
        "questions": _get_quick_questions(module),
    })


# ---------------- 流式对话 ----------------

@router.post("/chat/stream")
async def companion_chat_stream(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """流式对话：SSE 逐字返回 AI 回复。

    事件格式：
      data: {"type": "start", "intent": "qa", "engine": "llm"}
      data: {"type": "delta", "text": "你"}
      data: {"type": "delta", "text": "好"}
      data: {"type": "done", "text": "你好", "meta": {...}}

    规则引擎（operation）因为响应很快（毫秒级），不做流式，直接返回完整结果。
    LLM 不可用时降级为一次性返回（type=done 直接带全文）。
    """
    text = ((payload or {}).get("text") or "").strip()
    session_id = (payload or {}).get("session_id") or "default"
    module = (payload or {}).get("module") or ""
    scene_ctx = (payload or {}).get("scene_ctx") or ""

    async def _event_stream():
        # 空输入直接返回
        if not text:
            yield 'data: {"type":"done","text":"你想问什么？可以直接说操作，也可以直接提问。","meta":{"intent":"chat","engine":"fallback"}}\n\n'
            return

        conv = _get_or_create_conversation(db, user.id, session_id, module)
        intent = detect_intent(text)
        _append_history(user.id, session_id, "user", text)
        _save_message(db, conv.id, "user", text, intent=intent)
        _update_conversation_title(db, conv, text)

        # 1) 操作指令：规则引擎直接返回（毫秒级，不需流）
        if intent == "operation":
            result = await AgentService(db).infer(text, "experiment")
            reply = result.get("correction", "") or result.get("consequence", "")
            _append_history(user.id, session_id, "ai", reply)
            _save_message(
                db, conv.id, "ai", reply,
                intent="operation", engine="rule",
                level=result.get("level", ""),
                risk_score=result.get("risk_score", 0),
                source_count=len(result.get("source_refs") or []),
            )
            meta = {
                "intent": "operation",
                "engine": "rule",
                "level": result.get("level", ""),
                "risk_score": result.get("risk_score", 0),
                "source_count": len(result.get("source_refs") or []),
                "consequence": result.get("consequence", ""),
                "correction": result.get("correction", ""),
                "module": module,
            }
            yield f'data: {{"type":"start","intent":"operation","engine":"rule"}}\n\n'
            import json as _json
            yield f'data: {{"type":"done","text":{_json.dumps(reply, ensure_ascii=False)},"meta":{_json.dumps(meta, ensure_ascii=False)}}}\n\n'
            return

        # 2) QA / 闲聊：走 LLM 流式
        if intent == "qa":
            hits = await run_in_threadpool(RAGService(db).search, text, "experiment", top_k=3)
            if hits:
                lines = [
                    f"{i + 1}. [{h.get('level', 'low')}] {h.get('description', '')}（依据：{h.get('clause_ref', '')}）"
                    for i, h in enumerate(hits)
                ]
                clauses_text = "【安全条款（唯一事实源，回答必须以此为准）】\n" + "\n".join(lines) + "\n"
            else:
                clauses_text = (
                    "【注意】本问题未检索到直接对应的安全条款。如涉及急救或通用常识可以谨慎回答，"
                    "但必须：1) 提醒以指导老师/医护人员意见为准；2) 不得编造任何规程编号或数据。\n"
                )

            prompt = (
                f"{PERSONA}\n\n"
                f"{clauses_text}"
                f"{_history_prompt(_get_history(user.id, session_id))}"
                + (f"【当前场景】学生正在使用{module}模块。{scene_ctx}\n" if module or scene_ctx else "")
                + f"【学生的问题】{text}\n"
                + "请基于条款用大白话回答，并在最后用一句话点出最关键的注意事项。"
            )
            max_tokens = 420
            fallback_sources = [
                {"description": h.get("description", ""), "clause_ref": h.get("clause_ref", ""), "level": h.get("level", "low")}
                for h in hits
            ]
            fallback_engine = "llm"
            fallback_text = ""

            if hits:
                top = hits[0]
                fallback_text = (
                    f"关于这个问题，规程里是这么说的：{top.get('description', '')}。"
                    f" 依据条款：{top.get('clause_ref', '')}。"
                    "更细的正确步骤，可以把你的操作放到避错沙盘里推演，我一步步讲给你。"
                )
                fallback_engine = "rag"
            else:
                fallback_text = "这个我暂时没找到对应的安全条款，不敢乱说。建议你把具体操作放到避错沙盘里推演一下，或者问问老师。"
                fallback_engine = "fallback"
        else:
            # 闲聊
            prompt = (
                f"{PERSONA}\n\n"
                f"{_history_prompt(_get_history(user.id, session_id))}"
                + (f"【当前场景】学生正在使用{module}模块。\n" if module else "")
                + f"【学生说】{text}\n"
                + "学生这句不是在问安全问题，请以陪伴者的口吻自然回应一两句，"
                  "可以顺势引导他去做一次推演或看看案例，但不要硬广。"
            )
            max_tokens = 200
            fallback_sources = []
            fallback_engine = "fallback"
            fallback_text = _CHAT_FALLBACKS[
                len(_sessions.get(_session_key(user.id, session_id), {}).get("turns", [])) % len(_CHAT_FALLBACKS)
            ]

        # 开始流式输出
        import json as _json
        full_text = ""
        stream_started = False
        stream_failed = False

        try:
            async for chunk in try_ollama_generate_stream(prompt, max_tokens=max_tokens):
                if not stream_started:
                    stream_started = True
                    yield f'data: {{"type":"start","intent":"{intent}","engine":"llm"}}\n\n'
                full_text += chunk
                yield f'data: {{"type":"delta","text":{_json.dumps(chunk, ensure_ascii=False)}}}\n\n'
        except Exception:
            # 流式失败 → 走降级，一次性返回；标记失败以免 engine 被误记为 "llm"（详见 #9 修复）
            full_text = fallback_text
            stream_failed = True

        # 如果流式根本没开始（LLM 不可用 / 返回空），或中途失败，都走降级引擎，
        # 绝不能把降级文案记成 "llm"；同时必须把 fallback_text 作为真正回复内容返回，
        # 否则前端会收到空串（#9 修复补全：空流路径也要用兜底文案）。
        if not stream_started or stream_failed:
            engine = fallback_engine
            full_text = fallback_text
            yield f'data: {{"type":"start","intent":"{intent}","engine":"{engine}"}}\n\n'
        else:
            engine = "llm"

        # 存入历史 + 数据库
        _append_history(user.id, session_id, "ai", full_text)
        meta = {
            "intent": intent,
            "engine": engine,
            "module": module,
        }
        if intent == "qa":
            meta["sources"] = fallback_sources
            meta["source_count"] = len(fallback_sources)

        _save_message(
            db, conv.id, "ai", full_text,
            intent=intent, engine=engine,
            source_count=len(fallback_sources),
            meta=meta,
        )

        yield f'data: {{"type":"done","text":{_json.dumps(full_text, ensure_ascii=False)},"meta":{_json.dumps(meta, ensure_ascii=False)}}}\n\n'

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
