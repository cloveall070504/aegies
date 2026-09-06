/**
 * 数字人统一问答入口：文字面板 / 语音输入共用。
 *
 * 职责：
 *   1. 调 /companion/chat（后端意图识别分流：操作判定 / 知识问答 / 闲聊）；
 *   2. 把结果写进对话气泡流（companionChatStore）；
 *   3. 让数字人开口（digitalHumanStore.speak）——仅当数字人在台上。
 *
 * 安全口径：操作判定的文案完全来自规则引擎返回的
 * consequence/correction/risk_score，本函数只做拼装，不改写结论。
 */
import { companionChat, companionChatStream } from '../api/companion'
import useCompanionChatStore from '../store/companionChatStore'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { isCompanionStageActive, detectConfusionInText } from './companionEvents'

const OP_PREFIX = {
  high: '危险，这一步不能这么做。后果：',
  medium: '这里有问题。后果：',
  low: '基本可行，但注意：',
  none: '这个操作是安全的。',
}
const OP_EXPR = { high: 'alert', medium: 'thinking', low: 'calm', none: 'approve' }

export async function askCompanion(text, { module = '', sceneCode = '', sceneCtx = '' } = {}) {
  const t = (text || '').trim()
  if (!t) return null
  const cStore = useCompanionChatStore.getState()
  cStore.addMessage('user', t)
  cStore.setBusy(true)
  try {
    const res = await companionChat({ text: t, sessionId: cStore.sessionId, module, sceneCode, sceneCtx })
    const intent = res?.intent || 'chat'
    let display = ''
    let expression = 'calm'

    if (intent === 'operation') {
      // 规则引擎判定 → 数字人转述（不改写结论）
      const level = res.level || 'none'
      expression = OP_EXPR[level] || 'calm'
      display = OP_PREFIX[level] || OP_PREFIX.none
      if (res.consequence) display += res.consequence
      if (res.correction && level !== 'none') {
        const first = String(res.correction).split('\n').filter(Boolean)[0]
        if (first) display += ` 正确做法：${first}`
      }
      if (res.risk_score && level !== 'none') display += `（风险评分 ${res.risk_score}）`
    } else {
      display = res?.reply || '我刚才没想好怎么说，再问一次？'
      expression = intent === 'qa' ? 'focus' : 'calm'
    }

    useCompanionChatStore.getState().addMessage('ai', display, {
      intent,
      engine: res?.engine,
      level: res?.level,
      sources: res?.sources,
    })

    // 数字人在台上才朗读（独立路由页无舞台，只留气泡记录）
    if (isCompanionStageActive()) {
      const ms = Math.min(14000, 3500 + display.length * 180)
      useDigitalHumanStore.getState().speak(display, { expression, ms })
    }
    // 刷新会话列表（可能有新会话 / 标题更新）
    useCompanionChatStore.getState().loadConversations()
    return res
  } catch (err) {
    const msg = '这会儿网络或者引擎有点问题，稍等我一下再问。你也可以先把操作放进沙盘推演。'
    useCompanionChatStore.getState().addMessage('ai', msg, { intent: 'error' })
    return null
  } finally {
    useCompanionChatStore.getState().setBusy(false)
  }
}

/**
 * 流式版本的问答：SSE 逐字渲染，体感更快。
 * 完成后行为与 askCompanion 一致（数字人朗读、落库等）。
 */
export async function askCompanionStream(text, { module = '', sceneCode = '', sceneCtx = '' } = {}) {
  const t = (text || '').trim()
  if (!t) return null
  const cStore = useCompanionChatStore.getState()
  cStore.addMessage('user', t)
  cStore.setBusy(true)

  let finalText = ''
  let finalMeta = {}
  let intent = 'chat'
  let expression = 'calm'

  // 困惑检测：用户说"不懂/太难"等，在场景上下文中标记，LLM 会更耐心地解释
  const isConfused = detectConfusionInText(t)
  const enhancedCtx = isConfused
    ? (sceneCtx ? sceneCtx + ' ' : '') + '学生刚才表示困惑，回答时请更耐心、放慢节奏、用更简单的话讲。'
    : sceneCtx

  try {
    for await (const evt of companionChatStream({ text: t, sessionId: cStore.sessionId, module, sceneCode, scene_ctx: enhancedCtx })) {
      if (evt.type === 'start') {
        intent = evt.intent || 'chat'
        cStore.startStreaming({ intent, engine: evt.engine })
      } else if (evt.type === 'delta') {
        finalText += evt.text
        cStore.appendMessageDelta(evt.text)
      } else if (evt.type === 'done') {
        finalText = evt.text || finalText
        finalMeta = evt.meta || {}
        intent = finalMeta.intent || intent
        // 注意：这里不调 finishStreaming，移到外面统一处理（操作判定需要替换 text）
      }
    }

    // 操作判定：用 meta 里的 consequence/correction 拼装文案（和非流式保持一致）
    let display = finalText
    if (intent === 'operation') {
      const level = finalMeta.level || 'none'
      expression = OP_EXPR[level] || 'calm'
      const prefix = OP_PREFIX[level] || OP_PREFIX.none
      const consequence = finalMeta.consequence || ''
      const correction = finalMeta.correction || ''
      let assembled = prefix
      if (consequence) assembled += consequence
      if (correction && level !== 'none') {
        const firstLine = String(correction).split('\n').filter(Boolean)[0]
        if (firstLine) assembled += ` 正确做法：${firstLine}`
      }
      if (finalMeta.risk_score && level !== 'none') assembled += `（风险评分 ${finalMeta.risk_score}）`
      if (assembled.length > prefix.length) {
        display = assembled
      }
    } else {
      expression = intent === 'qa' ? 'focus' : 'calm'
    }

    // 数字人朗读（流式结束后才读，避免 TTS 跟文字流不同步）
    if (isCompanionStageActive() && display) {
      const ms = Math.min(14000, 3500 + display.length * 180)
      useDigitalHumanStore.getState().speak(display, { expression, ms })
    }
    // 统一结束流式：更新最后一条消息的 text（拼装后的）和 meta
    cStore.finishStreaming(finalMeta, display)
    // 刷新会话列表
    useCompanionChatStore.getState().loadConversations()
    return finalMeta
  } catch (err) {
    const msg = '这会儿网络或者引擎有点问题，稍等我一下再问。你也可以先把操作放进沙盘推演。'
    // 如果流式已经开始了，把错误文本追加到最后；否则加一条新的
    if (cStore.streaming) {
      cStore.appendMessageDelta(msg)
      cStore.finishStreaming({ intent: 'error' })
    } else {
      cStore.addMessage('ai', msg, { intent: 'error' })
      cStore.setBusy(false)
    }
    return null
  }
}

export default askCompanion
