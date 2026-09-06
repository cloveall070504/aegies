import { create } from 'zustand'
import { companionListConversations, companionGetMessages, companionQuickQuestions } from '../api/companion'

/**
 * 数字人对话记录（全局，学生端所有页面共享）。
 *
 * 文字面板（CompanionChat）与语音入口（VoiceInput）共用这份消息流：
 * 不管用户是打字还是说话，对话都在同一个气泡流里，数字人统一"开口"回应。
 *
 * meta 里放意图标签：{ intent, engine, level, sources, source_count }
 *
 * 新增能力：
 *  - 会话持久化：从后端加载历史，新消息落库（由 askCompanion 调用后端时写入）
 *  - 流式输出：appendMessageDelta 逐字追加到最后一条 AI 消息
 *  - 快捷问法：按模块动态拉取
 */
export const useCompanionChatStore = create((set, get) => ({
  sessionId: `dh-${Date.now().toString(36)}`,
  messages: [], // { id, role: 'user'|'ai', text, meta }
  busy: false,
  streaming: false,
  conversations: [], // 会话列表
  quickQuestions: [], // 当前模块的快捷问法
  quickModule: '', // 快捷问法对应的模块名

  addMessage: (role, text, meta = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set((s) => ({ messages: [...s.messages, { id, role, text, meta }] }))
    return id
  },

  /** 流式：追加到最后一条 AI 消息的 text 末尾 */
  appendMessageDelta: (delta) => {
    if (!delta) return
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'ai') {
        msgs[msgs.length - 1] = { ...last, text: last.text + delta }
      }
      return { messages: msgs }
    })
  },

  /** 流式开始：先放一条空的 AI 消息占位 */
  startStreaming: (meta = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set((s) => ({
      streaming: true,
      busy: true,
      messages: [...s.messages, { id, role: 'ai', text: '', meta }],
    }))
    return id
  },

  /** 流式结束：更新最后一条消息的 text 和 meta，关流式标记 */
  finishStreaming: (meta = {}, text) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'ai') {
        const updated = { ...last, meta: { ...last.meta, ...meta } }
        if (typeof text === 'string' && text.length > 0) {
          updated.text = text
        }
        msgs[msgs.length - 1] = updated
      }
      return { streaming: false, busy: false, messages: msgs }
    })
  },

  setBusy: (busy) => set({ busy }),

  setStreaming: (streaming) => set({ streaming }),

  /** 清空气泡流并换新会话（上下文从头开始） */
  reset: () => {
    const newId = `dh-${Date.now().toString(36)}`
    set({ messages: [], sessionId: newId, streaming: false, busy: false })
    // 刷新会话列表（新会话会在首条消息后出现）
    get().loadConversations()
  },

  /** 切换到指定会话 */
  switchSession: (sessionId) => {
    set({ sessionId, messages: [], streaming: false, busy: false })
    get().loadMessages(sessionId)
  },

  /** 从后端加载会话列表 */
  loadConversations: async () => {
    try {
      const list = await companionListConversations()
      set({ conversations: list || [] })
    } catch {
      // 加载失败不影响使用
    }
  },

  /** 从后端加载指定会话的消息 */
  loadMessages: async (sessionId) => {
    try {
      const msgs = await companionGetMessages(sessionId)
      // 把后端格式转成前端格式
      const formatted = (msgs || []).map((m) => ({
        id: `db-${m.id}`,
        role: m.role,
        text: m.text,
        meta: m.meta || {},
      }))
      set({ messages: formatted })
    } catch {
      set({ messages: [] })
    }
  },

  /** 加载当前模块的快捷问法 */
  loadQuickQuestions: async (module) => {
    const mod = module || ''
    if (get().quickModule === mod && get().quickQuestions.length > 0) return
    try {
      const data = await companionQuickQuestions(mod)
      set({ quickQuestions: data?.questions || [], quickModule: mod })
    } catch {
      // 失败就用空数组，不阻塞
    }
  },

  /** 删除会话 */
  deleteConversation: async (sessionId) => {
    try {
      const { deleteCompanionConversation } = await import('../api/companion')
      await deleteCompanionConversation(sessionId)
      // 如果删的是当前会话，重置
      if (get().sessionId === sessionId) {
        get().reset()
      } else {
        get().loadConversations()
      }
    } catch {
      // 删除失败不影响
    }
  },
}))

export default useCompanionChatStore
