import { useEffect, useRef, useState } from 'react'
import useCompanionChatStore from '../store/companionChatStore'
import { askCompanionStream } from '../utils/companionAsk'

/**
 * 数字人常驻对话面板（学生端 Nexus 左下角 / 全局悬浮助手）。
 *
 * 对应《数字人深度融合方案》"交互方式升级"：
 *   - 自由问答（LLM + RAG）：问任何实验安全问题都能答，答案带条款溯源；
 *   - 操作判定（规则引擎）：直接在输入框描述操作，数字人给风险判定；
 *   - 文字输入兜底：不方便说话时打字，效果一致（语音走 VoiceInput，
 *     与本面板共享同一条消息流和同一个会话上下文）。
 *
 * 新增能力：
 *   - 流式输出：SSE 逐字渲染，体感更快
 *   - 快捷问法动态化：按当前模块推荐不同问题
 *   - 会话历史：左侧会话列表，可切换/删除历史会话
 */

const INTENT_BADGE = {
  operation: { label: '⚙️ 操作判定 · 规则引擎', cls: 'cc-badge--op' },
  qa: { label: '📚 知识问答 · RAG+LLM', cls: 'cc-badge--qa' },
  chat: { label: '💬 陪伴对话', cls: 'cc-badge--chat' },
  error: { label: '⚠️ 连接异常', cls: 'cc-badge--err' },
}

export default function CompanionChat({ module = '', open: openProp, onOpenChange, showFab = true, showSidebar = false }) {
  const {
    messages, busy, reset, sessionId,
    conversations, quickQuestions,
    switchSession, loadConversations, loadQuickQuestions,
    deleteConversation,
  } = useCompanionChatStore()
  const [openState, setOpenState] = useState(false)
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const listRef = useRef(null)

  // 受控模式：open 由外部控制；非受控模式：内部管理
  const isControlled = typeof openProp === 'boolean'
  const open = isControlled ? openProp : openState
  const setOpen = (next) => {
    if (!isControlled) setOpenState(next)
    if (onOpenChange) onOpenChange(next)
  }

  // 展开时加载会话列表 + 快捷问法
  useEffect(() => {
    if (open) {
      loadConversations()
      loadQuickQuestions(module)
    }
  }, [open, module])

  // 模块变化时重新拉取快捷问法
  useEffect(() => {
    if (open) loadQuickQuestions(module)
  }, [module])

  // 新消息自动滚到底
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, open])

  // Esc 关闭面板 + 打开时聚焦输入框
  const inputRef = useRef(null)
  useEffect(() => {
    if (!open) return
    // 打开后聚焦输入框
    setTimeout(() => inputRef.current?.focus(), 100)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = async (text) => {
    const t = (text ?? input).trim()
    if (!t || busy) return
    setInput('')
    await askCompanionStream(t, { module })
  }

  const handleNewChat = () => {
    reset()
    setSidebarOpen(false)
  }

  const handleSwitchConv = (sid) => {
    switchSession(sid)
    setSidebarOpen(false)
  }

  const handleDeleteConv = (e, sid) => {
    e.stopPropagation()
    if (confirm('确定删除这个会话吗？')) {
      deleteConversation(sid)
    }
  }

  return (
    <div className={`cc${open ? ' cc--open' : ''}`}>
      {/* 折叠态：圆形入口按钮（受控模式或 showFab=false 时隐藏） */}
      {!open && showFab && (
        <button type="button" className="cc-fab" onClick={() => setOpen(true)} aria-label="打开数字人对话">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {messages.length > 0 && <span className="cc-fab__dot" />}
        </button>
      )}

      {/* 展开态：气泡流 + 快捷提问 + 输入框 */}
      {open && (
        <div className="cc-panel" role="dialog" aria-label="数字人对话">
          <div className="cc-head">
            <div className="cc-head__id">
              {showSidebar && (
                <button type="button" className="cc-icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="会话历史">
                  ☰
                </button>
              )}
              <span className="cc-head__name">实验安全向导</span>
              <span className="cc-head__sub">可提问 · 可描述操作 · 可闲聊</span>
            </div>
            <div className="cc-head__btns">
              <button type="button" className="cc-icon-btn" onClick={handleNewChat} title="新对话">＋</button>
              <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} title="收起">×</button>
            </div>
          </div>

          <div className="cc-body">
            {/* 会话侧边栏 */}
            {showSidebar && sidebarOpen && (
              <div className="cc-sidebar">
                <div className="cc-sidebar__title">
                  <span>历史对话</span>
                  <button className="cc-icon-btn" onClick={handleNewChat} title="新对话">＋</button>
                </div>
                <div className="cc-sidebar__list">
                  {conversations.length === 0 && (
                    <div className="cc-sidebar__empty">暂无历史对话</div>
                  )}
                  {conversations.map((c) => (
                    <div
                      key={c.session_id}
                      className={`cc-sidebar__item${c.session_id === sessionId ? ' active' : ''}`}
                      onClick={() => handleSwitchConv(c.session_id)}
                    >
                      <span className="cc-sidebar__title-text" title={c.title}>{c.title || '新对话'}</span>
                      <button
                        type="button"
                        className="cc-sidebar__del"
                        onClick={(e) => handleDeleteConv(e, c.session_id)}
                        title="删除会话"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 消息区 */}
            <div className="cc-list" ref={listRef}>
              {messages.length === 0 && (
                <div className="cc-empty">
                  你好呀～直接<strong>提问</strong>（比如"浓硫酸怎么稀释"）、<strong>描述操作</strong>（比如"我没戴手套就取浓硫酸"）
                  或者随便聊聊都行。答案都会标注来源：判定来自规则引擎，讲解来自规程条款。
                </div>
              )}
              {messages.map((m) => {
                const badge = INTENT_BADGE[m.meta?.intent]
                const isStreamingEmpty = m.role === 'ai' && !m.text && m.meta?.intent
                return (
                  <div key={m.id} className={`cc-msg cc-msg--${m.role}`}>
                    <div className="cc-bubble">
                      {m.role === 'ai' && badge && <span className={`cc-badge ${badge.cls}`}>{badge.label}</span>}
                      <div className="cc-text">
                        {m.text}
                        {isStreamingEmpty && <span className="cc-cursor" />}
                      </div>
                      {m.role === 'ai' && m.meta?.sources?.length > 0 && (
                        <div className="cc-sources">
                          依据条款：{m.meta.sources.map((s, i) => (
                            <span key={i} className="cc-source">{s.clause_ref || s.description}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="cc-quick" id="cc-quick-hint" role="group" aria-label="快捷问法">
            <span className="sr-only">快捷问法，点击按钮直接发送</span>
            {quickQuestions.map((q) => (
              <button key={q} type="button" className="cc-chip" onClick={() => send(q)} disabled={busy} aria-label={`快捷提问：${q}`}>{q}</button>
            ))}
          </div>

          <div className="cc-input-row">
            <label htmlFor="cc-input-field" className="sr-only">给数字人发消息</label>
            <input
              id="cc-input-field"
              ref={inputRef}
              className="cc-input"
              placeholder="输入问题或操作…（回车发送）"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={busy}
              aria-label="给数字人发消息，按回车发送"
              aria-describedby="cc-quick-hint"
            />
            <button type="button" className="cc-send" onClick={() => send()} disabled={busy || !input.trim()}>发送</button>
          </div>
        </div>
      )}
    </div>
  )
}
