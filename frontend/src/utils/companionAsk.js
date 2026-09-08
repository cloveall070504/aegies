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
import { coachAttribute, coachAward } from '../api/coach'
import useCompanionChatStore from '../store/companionChatStore'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { isCompanionStageActive, detectConfusionInText } from './companionEvents'
import { handleSocraticAnswer, autoSocraticForDanger } from './socraticFlow'
import { stripTics, stripMarkdownMarks } from './cleanTalk'

// 每个会话仅记一次"实验推演"用于解锁徽章，避免每条操作消息都 +1
const _awardedSessions = new Set()
// 同一会话内同一句操作文本只发一次"教练笔记"，避免重复判定/重复触发时刷屏
const _notedOperations = new Set()

function _noteKey(sid, text) {
  return `${sid}::${(text || '').slice(0, 60)}`
}

/**
 * 操作判定后触发的教练动作（项3/项10 自动侧）。
 *
 * 诚实性护栏：
 *   - 只有 high/medium（确实出错/有风险）才写"错因归因"到长期记忆并显示教练笔记，
 *     low/none（安全/基本可行）绝不归类错因、不显示"错因"笔记（与"low 不列风险点"一致）；
 *   - 高危（high）自动开一轮苏格拉底追问（项1 融入对话，见 socraticFlow）。
 */
async function _coachOnOperation(text, level, correction = '') {
  const risky = level === 'high' || level === 'medium'
  const sid = useCompanionChatStore.getState().sessionId
  const noteDedup = risky && _notedOperations.has(_noteKey(sid, text))
  if (risky && !noteDedup) {
    _notedOperations.add(_noteKey(sid, text))
    // 笔记文案：引用学生具体操作（截短），否则连续几次高危操作会生成一模一样的句子，
    // 看起来像"同一条刷了三遍"；中文等级不暴露 high/medium 内部键；正文不带"教练笔记："前缀。
    const LEVEL_CN = { high: '高危', medium: '中危' }
    const brief = (text || '').trim().slice(0, 18)
    let note = ''
    try {
      const attr = await coachAttribute({ operationText: text, studentAnswer: '' })
      const et = attr?.error_type || '操作习惯'
      const quoted = brief ? `「${brief}」这步` : '这一步'
      note = level === 'high'
        ? `${quoted}属于${LEVEL_CN[level] || level}操作，错因倾向「${et}」。我下面出个题帮你巩固。`
        : `${quoted}有${LEVEL_CN[level] || level}风险，错因倾向「${et}」。已记入你的薄弱点，同类操作下次留意。`
    } catch (_) {
      return
    }
    useCompanionChatStore.getState().addMessage('coach', note, { coachNote: true, kind: 'note', level })
  }

  // 按会话记一次实验推演（无论安全与否都算完成一次推演），命中阈值解锁徽章
  if (!_awardedSessions.has(sid)) {
    _awardedSessions.add(sid)
    try {
      const d = await coachAward('experiment_done')
      if (d?.newly_unlocked?.length) {
        const names = d.newly_unlocked.map((x) => x.name).join('、')
        useCompanionChatStore.getState().addMessage('coach', `解锁了新徽章：${names}`, { coachNote: true, kind: 'badge' })
      }
    } catch (_) { /* 解锁失败不影响主流程 */ }
  }

  // 高危 → 自动开一轮苏格拉底追问（同一会话同一操作只问一次，可被跳过）
  if (level === 'high') {
    autoSocraticForDanger(text, { level, correction })
  }
}

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
  // 用户发出新输入 → 立即停掉上一段朗读（不要等新回答返回才被 stopSpeech 顶掉）
  useDigitalHumanStore.getState().hush()
  // 苏格拉底追问激活时：输入优先当作"作答"处理（答对深挖/答错引导/提示/结束）
  if (useCompanionChatStore.getState().socratic) {
    const consumed = await handleSocraticAnswer(t)
    if (consumed) {
      useCompanionChatStore.getState().loadConversations()
      return { _socratic: true }
    }
  }
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
      // LLM 生成的回答：去口头禅（"哎呀哎呀"等）再展示/朗读
      display = stripMarkdownMarks(stripTics(res?.reply)) || '我刚才没想好怎么说，再问一次？'
      expression = intent === 'qa' ? 'focus' : 'calm'
    }

    useCompanionChatStore.getState().addMessage('ai', display, {
      intent,
      engine: res?.engine,
      level: res?.level,
      sources: res?.sources,
      opText: intent === 'operation' ? t : '',
      correction: intent === 'operation' ? (res?.correction || '') : '',
    })

    // 数字人在台上才朗读（独立路由页无舞台，只留气泡记录）
    if (isCompanionStageActive()) {
      const ms = Math.min(14000, 3500 + display.length * 180)
      useDigitalHumanStore.getState().speak(display, { expression, ms })
    }
    // 操作判定后：写长期记忆 + 解锁徽章 + 教练笔记 + 高危自动苏格拉底（自动侧）
    if (intent === 'operation') {
      _coachOnOperation(t, res.level || 'none', res?.correction || '')
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
  // 用户发出新输入 → 立即停掉上一段朗读（不要等新回答返回才被 stopSpeech 顶掉）
  useDigitalHumanStore.getState().hush()
  // 苏格拉底追问激活时：输入优先当作"作答"处理
  if (useCompanionChatStore.getState().socratic) {
    const consumed = await handleSocraticAnswer(t)
    if (consumed) {
      useCompanionChatStore.getState().loadConversations()
      return { _socratic: true }
    }
  }
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
      // LLM 生成的回答：去口头禅（"哎呀哎呀"等）再展示/朗读
      display = stripMarkdownMarks(stripTics(finalText)) || finalText
      expression = intent === 'qa' ? 'focus' : 'calm'
    }

    // 数字人朗读（流式结束后才读，避免 TTS 跟文字流不同步）
    if (isCompanionStageActive() && display) {
      const ms = Math.min(14000, 3500 + display.length * 180)
      useDigitalHumanStore.getState().speak(display, { expression, ms })
    }
    // 统一结束流式：更新最后一条消息的 text（拼装后的）和 meta
    cStore.finishStreaming(finalMeta, display)
    // 操作判定后：写长期记忆 + 解锁徽章 + 教练笔记 + 高危自动苏格拉底
    if (intent === 'operation') {
      // 让判定气泡携带原操作文本与正确做法，供"考考我"复用
      const lastMsg = useCompanionChatStore.getState().messages.slice(-1)[0]
      if (lastMsg && lastMsg.role === 'ai') {
        cStore.updateLastMeta({ opText: t, correction: finalMeta.correction || '' })
      }
      _coachOnOperation(t, finalMeta.level || 'none', finalMeta.correction || '')
    }
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
