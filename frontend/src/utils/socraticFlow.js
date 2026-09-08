/**
 * 苏格拉底追问 · 对话内闭环（项1/项2 融入对话）。
 *
 * 为什么需要这个文件：
 *   后端 /socratic 每次只回答"针对当前回答的一步"，是无状态单轮接口。
 *   以前前端把苏格拉底做成了 CoachPanel 里的一次性表单——问完第一问就断了，
 *   学生没地方作答，追问链走不下去，等于摆设。
 *
 *   本模块把追问变成**对话状态机**：危险操作判定后自动抛第一问 →
 *   学生在对话输入框直接作答 → 判读答对方向就深挖、答错就引导/给提示 →
 *   直到确认理解或学生主动结束。所有"该说的话"仍来自规则引擎/主题知识库
 *   （coach_service），本模块只做路由与状态管理，不生产任何安全结论。
 *
 * 状态存于 companionChatStore.socratic：
 *   { opText, topic, round, hintLevel, level, correction }
 */
import { coachSocratic, coachHints } from '../api/coach'
import useCompanionChatStore from '../store/companionChatStore'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { isCompanionStageActive } from './companionEvents'

// 去重：同一会话内对同一操作文本只自动问一次（学生可主动跳过）
const _autoAsked = new Set()

/** 当前是否有进行中的追问 */
export function hasActiveSocratic() {
  return !!useCompanionChatStore.getState().socratic
}

function _push(text, expression, extraMeta = {}, noSpeak = false) {
  if (!text) return
  const store = useCompanionChatStore.getState()
  store.addMessage('ai', text, { coachFlow: true, ...extraMeta })
  if (!noSpeak && isCompanionStageActive()) {
    const ms = Math.min(12000, 3500 + text.length * 160)
    useDigitalHumanStore.getState().speak(text, { expression, ms })
  }
}

function _end() {
  useCompanionChatStore.getState().endSocratic()
}

/**
 * 开启一轮追问：对 opText 抛第一问（后端判定该操作主题后的 socratic_intro）。
 * opts: { level, correction, topic, auto }
 */
export async function startSocratic(opText, opts = {}) {
  const store = useCompanionChatStore.getState()
  const t = (opText || '').trim()
  if (!t || store.socratic || store.busy) return
  try {
    const d = await coachSocratic({ operationText: t })
    if (!d?.content) return
    store.beginSocratic(t, opts.topic || d.topic || '', {
      level: opts.level || '',
      correction: opts.correction || '',
    })
    const prefix = opts.auto
      ? '趁热打铁，我考考你真懂没懂：'
      : '那我问你一个问题，检验一下是不是真理解了：'
    // 自动触发（紧随判定之后）首问不朗读：判定语音可能还在播，避免单路 TTS 掐断警告。
    // 学生作答/手动触发时正常朗读。
    _push(prefix + d.content, 'thinking', { intent: 'coach', level: opts.level || '' }, !!opts.auto)
  } catch (_) {
    // 追问启动失败静默，不打断主对话
  }
}

/** 危险操作（high）判定后自动触发一轮追问（同一操作同会话仅一次） */
export function autoSocraticForDanger(opText, opts = {}) {
  const store = useCompanionChatStore.getState()
  const t = (opText || '').trim()
  if (!t || opts.level !== 'high') return
  if (store.socratic) return
  const key = `${store.sessionId}::${t}`
  if (_autoAsked.has(key)) return
  _autoAsked.add(key)
  startSocratic(t, { ...opts, auto: true })
}

/** 给一级渐进提示（项2，hintLevel 0→3，逐级给出不剧透） */
let _hintInflight = false
export async function hintNow() {
  if (_hintInflight) return
  const s = useCompanionChatStore.getState().socratic
  if (!s) return
  _hintInflight = true
  const next = Math.min(3, (s.hintLevel || 0) + 1)
  try {
    const d = await coachHints({ text: s.opText, level: next })
    const hint = d?.hint || d?.levels?.[next - 1]?.hint
    if (!hint) return
    useCompanionChatStore.getState().advanceSocratic({ hintLevel: next })
    _push(`💡 提示 ${next}/3：${hint}`, 'calm', { intent: 'coach' })
  } catch (_) { /* 提示失败忽略 */ } finally {
    _hintInflight = false
  }
}

/** 揭示正确做法并结束（规则引擎 correction 已在判定时缓存） */
function _revealAndEnd(s) {
  const store = useCompanionChatStore.getState()
  const core = s.correction || ''
  const first = String(core).split('\n').filter(Boolean)[0]
  if (first) {
    _push(`记住：${first}`, 'focus', { intent: 'coach' })
  } else {
    _push('把握不住的时候，回看上面的判定说明，按正确做法来。', 'calm', { intent: 'coach' })
  }
  store.advanceSocratic({ revealed: true })
  _end()
}

/** 学生主动结束追问：若判定有风险且尚未揭示正确做法，补一句安全兜底再收尾 */
export function exitSocratic() {
  const s = useCompanionChatStore.getState().socratic
  if (!s) return
  if (s.level === 'high' && !s.revealed) {
    _revealAndEnd(s)
    return
  }
  _push('好，先到这。任何时候卡住了都可以点「💡 提示」或继续问我。', 'calm', { intent: 'coach' })
  _end()
}

// 学生"想换话题/新问题"的强信号（直接当普通对话发，不当回答处理）
const _NEW_TOPIC_RE = /^(为什么|怎么|如何|什么是|啥是|多少|哪个|哪些|对吗|可以吗|是不是|能否|what|why|how)/i
// 学生明确要提示/不会的弱信号 → 走渐进提示而不是硬判对错
const _HINT_RE = /提示|不会|不知道|想不出|没思路|帮帮我|给点线索|hint|help/i
const _QUIT_RE = /不问了|跳过|算了|结束|先这样|不用了|别问|停|exit|stop/i

/**
 * 处理学生在追问中的一条回复。返回 true 表示已作为追问作答消费掉；
 * 返回 false 表示这不是有效作答（可放行走普通对话）。
 */
let _answerInflight = false
export async function handleSocraticAnswer(text) {
  const store = useCompanionChatStore.getState()
  const s = store.socratic
  const t = (text || '').trim()
  if (!s) return false
  if (!t) return false
  if (_answerInflight) return true // 正在处理上一条作答，忽略连发

  // 1) 明显的新话题提问 → 结束当前追问并放行普通对话（不占 inflight，立即放行）
  if (_NEW_TOPIC_RE.test(t)) {
    _end()
    return false
  }

  _answerInflight = true
  try {
    // 2) 想结束 → 收尾
    if (_QUIT_RE.test(t)) {
      store.addMessage('user', t)
      exitSocratic()
      return true
    }
    // 3) 想提示 / 不会 → 给渐进提示；三级都给了仍不会 → 揭示正确做法
    if (_HINT_RE.test(t)) {
      store.addMessage('user', t)
      if ((store.socratic?.hintLevel || 0) >= 3) {
        _revealAndEnd(store.socratic)
        return true
      }
      hintNow()
      return true
    }

    // 4) 正常作答：把学生原话加入对话，再问后端判读
    store.addMessage('user', t)
    store.setBusy(true)
    const opTextAtSend = s.opText
    try {
      const d = await coachSocratic({ operationText: opTextAtSend, studentAnswer: t })
      // 竞态保护：请求在途时若追问已被退出 / 会话已切换，结果作废不追加
      const live = useCompanionChatStore.getState().socratic
      if (!live || live.opText !== opTextAtSend) return true
      const liveRound = live.round || 1
      const liveHintLevel = live.hintLevel || 0
      const mode = d?.mode || 'explain'
      if (mode === 'deepen') {
        // 答对方向：round1 → 深挖第二层；round≥2 → 已连续答对，认可并收尾
        if (liveRound >= 2) {
          _push('很好，你已经能把关键点说明白了——这一步的要点你确实吃透了。' + (d.content ? ' ' + d.content : ''), 'approve', { intent: 'coach' })
          _end()
        } else {
          store.advanceSocratic({ round: 2 })
          _push(d.content || '那如果换个场景，这个原则还适用吗？', 'thinking', { intent: 'coach' })
        }
      } else if (mode === 'correct') {
        // 答错且有风险：不直接剧透完整做法（判定气泡已给过一次），
        // 先对照判定里说的"正确做法"引导学生反推原因；
        // 已错 2 次（round≥3）或提示给满仍错 → 复述正确做法并收尾
        if (liveRound >= 3 || liveHintLevel >= 3) {
          _push('这一步要按正确做法来，不能图省事。' + (d.content ? ` ${d.content}` : ''), 'alert', { intent: 'coach' })
          _end()
        } else {
          store.advanceSocratic({ round: liveRound + 1 })
          if (liveHintLevel >= 1) {
            _push('还是没答到点上。再对照上面判定说的「正确做法」，想想它为什么能避免危险？', 'thinking', { intent: 'coach' })
          } else {
            _push('方向不太对。先别急着说答案——回看上面判定里的「正确做法」，你能说出它背后的原因吗？', 'thinking', { intent: 'coach' })
          }
        }
      } else {
        // explain / question 兜底：给解释并结束
        _push(d.content || '咱们理一下正确做法。', 'focus', { intent: 'coach' })
        _end()
      }
      return true
    } catch (_) {
      store.setBusy(false)
      // 判读失败：用户原话已入流，不能再放行普通对话（避免重复 user 消息）
      _push('我刚才没接住你的回答，先跳过这轮追问。你可以重新描述操作，我们继续聊。', 'calm', { intent: 'coach' })
      _end()
      return true
    } finally {
      store.setBusy(false)
    }
  } finally {
    _answerInflight = false
  }
}
