import { useEffect, useRef, useState } from 'react'
import useCompanionChatStore from '../store/companionChatStore'
import { askCompanionStream } from '../utils/companionAsk'
import { hintNow, exitSocratic, startSocratic } from '../utils/socraticFlow'
import { setSpeechRate, setInterruptHandler } from '../utils/speechController'
import { coachSpeechRate, coachWeakReminder, coachInterrupt } from '../api/coach'
import CoachSettings from './CoachSettings'
import VisionCorrector from './VisionCorrector'
import '../styles/coach.css'

/**
 * 数字人常驻对话面板（学生端 Nexus 左下角 / 全局悬浮助手）。
 *
 * 教练能力已"融入对话"（不再有孤立教练表单页）：
 *   - 自由问答 / 操作判定（规则引擎）仍是主对话流；
 *   - 高危操作判定后，数字人在对话里自动发起苏格拉底追问（项1），
 *     学生直接在输入框作答 → 答对深挖 / 答错引导 / 可要提示（项2渐进）或结束；
 *   - 徽章 / 形象声音 / 打断开关等低频设置收进右上 ⚙️（CoachSettings）；
 *   - 摄像头视觉纠错（项12）作为第二个标签「视觉纠错」独立使用。
 */

const INTENT_BADGE = {
  operation: { label: '操作判定 · 规则引擎', cls: 'cc-badge--op' },
  qa: { label: '知识问答 · RAG+LLM', cls: 'cc-badge--qa' },
  chat: { label: '陪伴对话', cls: 'cc-badge--chat' },
  error: { label: '连接异常', cls: 'cc-badge--err' },
  coach: { label: '教练提问', cls: 'cc-badge--coach' },
}

// 教练消息（role=coach）按 kind 显示不同标签，不再一律叫"教练笔记"
const COACH_LABEL = {
  note: '教练笔记',
  reminder: '跨场景提醒',
  badge: '成就解锁',
}

const _greetedSessions = new Set()

export default function CompanionChat({ module = '', open: openProp, onOpenChange, showFab = true, showSidebar = false }) {
  const {
    messages, busy, reset, sessionId, socratic,
    conversations, quickQuestions,
    switchSession, loadConversations, loadQuickQuestions,
    deleteConversation,
  } = useCompanionChatStore()
  const [openState, setOpenState] = useState(false)
  const [input, setInput] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState('chat')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [quickHidden, setQuickHidden] = useState(false)
  const listRef = useRef(null)

  // 受控模式：open 由外部控制；非受控模式：内部管理
  const isControlled = typeof openProp === 'boolean'
  const open = isControlled ? openProp : openState
  const setOpen = (next) => {
    if (!isControlled) setOpenState(next)
    if (onOpenChange) onOpenChange(next)
  }

  // 展开时加载会话列表 + 快捷问法 + 语速偏好 + 跨场景问候（每会话一次）
  useEffect(() => {
    if (open) {
      loadConversations()
      loadQuickQuestions(module)
      coachSpeechRate().then((d) => {
        if (d?.speech_rate) setSpeechRate(d.speech_rate)
      }).catch(() => {})
      // 自动语音打断的汇报链：检测到开口 → 停 TTS + 通知后端标记（CoachPanel 已移除，改由面板注册）
      setInterruptHandler(() => {
        coachInterrupt(useCompanionChatStore.getState().sessionId).catch(() => {})
      })
      const sid = useCompanionChatStore.getState().sessionId
      if (!_greetedSessions.has(sid)) {
        _greetedSessions.add(sid)
        coachWeakReminder('').then((d) => {
          const rem = d?.reminder
          if (rem) {
            useCompanionChatStore.getState().addMessage('coach', rem, { coachNote: true, kind: 'reminder' })
          }
        }).catch(() => {})
      }
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
  }, [messages, busy, open, tab, settingsOpen])

  // Esc 关闭面板 + 打开时聚焦输入框
  const inputRef = useRef(null)
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 100)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, settingsOpen])

  const send = async (text) => {
    const t = (text ?? input).trim()
    if (!t || busy) return
    setInput('')
    await askCompanionStream(t, { module })
  }

  const handleNewChat = () => {
    reset()
    setSidebarOpen(false)
    setSettingsOpen(false)
    setQuickHidden(false)
  }

  const handleSwitchConv = (sid) => {
    switchSession(sid)
    setSidebarOpen(false)
    setQuickHidden(false)
  }

  const handleDeleteConv = (e, sid) => {
    e.stopPropagation()
    if (confirm('确定删除这个会话吗？')) {
      deleteConversation(sid)
    }
  }

  // 「考考我」手动开启追问（对某条判定气泡）
  const drillThis = (m) => {
    if (busy || !m?.meta?.opText) return
    startSocratic(m.meta.opText, {
      level: m.meta.level || 'high',
      correction: m.meta.correction || '',
    })
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

      {/* 展开态 */}
      {open && (
        <div className="cc-panel" role="dialog" aria-label="数字人对话">
          <div className="cc-head">
            <div className="cc-head__id">
              {showSidebar && (
                <button type="button" className="cc-icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="会话历史">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h10M4 18h16" /></svg>
                </button>
              )}
              <span className="cc-head__name">实验安全向导</span>
              <span className="cc-head__sub">
                {socratic ? '教练提问中，直接回复我即可' : (settingsOpen ? '设置' : tab === 'vision' ? '摄像头纠错' : '可提问 · 可描述操作 · 可闲聊')}
              </span>
            </div>
            <div className="cc-head__btns">
              <button type="button" className={`cc-icon-btn${settingsOpen ? ' cc-icon-btn--on' : ''}`} onClick={() => { setSettingsOpen(!settingsOpen); setSidebarOpen(false) }} title="教练设置">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></svg>
              </button>
              <button type="button" className="cc-icon-btn" onClick={handleNewChat} title="新对话">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button type="button" className="cc-icon-btn" onClick={() => setOpen(false)} title="收起">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {!settingsOpen && (
            <div className="cc-tabs">
              <button type="button" className={`cc-tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>对话</button>
              <button type="button" className={`cc-tab${tab === 'vision' ? ' active' : ''}`} onClick={() => setTab('vision')}>视觉纠错</button>
            </div>
          )}

          {settingsOpen ? (
            <CoachSettings onClose={() => setSettingsOpen(false)} />
          ) : tab === 'chat' ? (
            <>
              <div className="cc-body">
                {showSidebar && sidebarOpen && (
                  <div className="cc-sidebar">
                    <div className="cc-sidebar__title">
                      <span>历史对话</span>
                      <button className="cc-icon-btn" onClick={handleNewChat} title="新对话">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      </button>
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
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="cc-list" ref={listRef}>
                  {messages.length === 0 && (
                    <div className="cc-empty">
                      你好呀～直接<strong>提问</strong>（比如"浓硫酸怎么稀释"）、<strong>描述操作</strong>（比如"我没戴手套就取浓硫酸"）
                      或者随便聊聊都行。答案都会标注来源：判定来自规则引擎，讲解来自规程条款。
                      <br />描述一个<strong>危险操作</strong>后，我会在对话里提问考考你，检验你是不是真懂了。
                    </div>
                  )}
                  {messages.map((m) => {
                    const badge = INTENT_BADGE[m.meta?.intent]
                    const isStreamingEmpty = m.role === 'ai' && !m.text && m.meta?.intent
                    const showDrill = m.role === 'ai' && m.meta?.intent === 'operation'
                      && m.meta?.opText && (m.meta.level === 'high' || m.meta.level === 'medium')
                      && !socratic
                    return (
                      <div key={m.id} className={`cc-msg cc-msg--${m.role}`}>
                        <div className="cc-bubble">
                          {m.role === 'coach' && <div className="cc-coach-label">{COACH_LABEL[m.meta?.kind] || '教练笔记'}</div>}
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
                          {showDrill && (
                            <div className="cc-drill-row">
                              <button type="button" className="cc-chip cc-chip--drill" disabled={busy} onClick={() => drillThis(m)}>考考我（苏格拉底追问）</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 苏格拉底追问状态条：追问进行中在输入区上方给快捷操作 */}
              {socratic && (
                <div className="cc-soc-bar">
                  <span className="cc-soc-bar__txt">正在追问：回答我上面的问题；卡住了可以要提示或跳过</span>
                  <div className="cc-soc-bar__btns">
                    <button type="button" className="cc-chip" disabled={busy} onClick={() => hintNow()}>提示一下</button>
                    <button type="button" className="cc-chip" disabled={busy} onClick={() => exitSocratic()}>结束追问</button>
                  </div>
                </div>
              )}

              <div className="cc-quick" id="cc-quick-hint" role="group" aria-label="快捷问法">
                {!socratic && !quickHidden && quickQuestions.length > 0 && (
                  <>
                    <div className="cc-quick__head">
                      <span>快捷问法</span>
                      <button type="button" className="cc-quick__close" onClick={() => setQuickHidden(true)} title="收起快捷问法" aria-label="收起快捷问法">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="cc-quick__chips">
                      {quickQuestions.map((q) => (
                        <button key={q} type="button" className="cc-chip" onClick={() => send(q)} disabled={busy} aria-label={`快捷提问：${q}`}>{q}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="cc-input-row">
                <input
                  id="cc-input-field"
                  ref={inputRef}
                  className="cc-input"
                  placeholder={socratic ? '回答教练的问题…（直接输入你的想法）' : '输入问题或操作…（回车发送）'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  disabled={busy}
                  aria-label="给数字人发消息，按回车发送"
                  aria-describedby="cc-quick-hint"
                />
                <button type="button" className="cc-send" onClick={() => send()} disabled={busy || !input.trim()}>发送</button>
              </div>
            </>
          ) : (
            <div className="cc-vision-wrap">
              <VisionCorrector />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
