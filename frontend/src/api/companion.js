import client from './client'
import useAuthStore from '../store/authStore'
import { trackLLM } from '../utils/telemetry'

/**
 * 数字人对话中枢接口（/companion）。
 *
 * 统一入口：后端做意图识别后分流——
 *   operation → 规则引擎判定（唯一事实源）
 *   qa        → RAG 检索 + LLM 生成（带 sources 溯源）
 *   chat      → 人设短回复
 * 失败时由调用方降级（数字人说"没听清"，不影响页面其它功能）。
 */
export function companionChat({ text, sessionId = 'default', module = '', sceneCode = '', sceneCtx = '' }) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  return client.post(
    '/companion/chat',
    { text, session_id: sessionId, module, scene_code: sceneCode, scene_ctx: sceneCtx },
    { timeout: 90000 },
  ).then(
    (res) => {
      trackLLM(true, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
      return res
    },
    (err) => {
      trackLLM(false, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
      throw err
    },
  )
}

/** 流式对话：SSE 逐字返回，返回 async generator */
export async function* companionChatStream({ text, sessionId = 'default', module = '', sceneCode = '', sceneCtx = '' }) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  let ok = false
  try {
    const token = useAuthStore.getState().token || ''
    const resp = await fetch('/api/v1/companion/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'X-Client-Type': 'pc',
      },
      body: JSON.stringify({ text, session_id: sessionId, module, scene_code: sceneCode, scene_ctx: sceneCtx }),
    })

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const dataStr = trimmed.slice(5).trim()
        if (!dataStr) continue
        try {
          yield JSON.parse(dataStr)
        } catch {
          // 忽略解析失败的行
        }
      }
    }
    ok = true
  } catch (e) {
    trackLLM(false, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    throw e
  }
  if (ok) trackLLM(true, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
}

/** 获取当前用户的会话列表 */
export function companionListConversations() {
  return client.get('/companion/conversations')
}

/** 获取指定会话的消息列表 */
export function companionGetMessages(sessionId) {
  return client.get(`/companion/conversations/${encodeURIComponent(sessionId)}/messages`)
}

/** 删除指定会话 */
export function deleteCompanionConversation(sessionId) {
  return client.delete(`/companion/conversations/${encodeURIComponent(sessionId)}`)
}

/** 按模块获取快捷问法 */
export function companionQuickQuestions(module = '') {
  return client.get('/companion/quick-questions', { params: { module } })
}
