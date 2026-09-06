/**
 * 数字人场景事件中枢 —— 六大融合场景的"事件驱动发言"。
 *
 * 对应《数字人深度融合方案》第 3 章：业务模块发生关键事件（操作出错、
 * 进入新步骤、打开案例、提交作业……）时，数字人主动开口，而不是等用户来问。
 *
 * 使用方式：各模块只管把自己的事件丢进来（notifyXxx），本模块负责：
 *   1. 判断数字人是否在台上（stageActive，由 Nexus 挂载/卸载时切换——
 *      独立路由如 /sandbox 没有数字人舞台，静默跳过，不做无效播报）；
 *   2. 把事件数据组织成一句"该说的话"，交给 digitalHumanStore.speak()
 *      驱动字幕 + TTS + 表情。
 *
 * 台词原则：内容全部来自业务数据（判定结果/步骤要点/画像数字），
 * 不在这里编造安全结论——安全结论永远来自规则引擎。
 */
import useDigitalHumanStore from '../store/digitalHumanStore'

let stageActive = false

/** Nexus 挂载数字人舞台时置 true，卸载时置 false */
export function setCompanionStageActive(v) {
  stageActive = !!v
}

/** 数字人是否在台上（供面板/语音入口判断要不要朗读） */
export function isCompanionStageActive() {
  return stageActive
}

function speak(text, opts = {}) {
  if (!stageActive || !text) return
  useDigitalHumanStore.getState().speak(text, opts)
}

/* ================= 场景 1：避错沙盘 · 实时操作教练 ================= */

const LEVEL_PREFIX = {
  high: '危险！这一步我必须打断你。',
  medium: '这里有问题，先停一下。',
  low: '基本可行，但有个细节要提醒你。',
  none: '这一步很稳，继续保持。',
}
const LEVEL_EXPR = {
  high: 'alert', medium: 'thinking', low: 'calm', none: 'approve',
}

/** 沙盘每推演一步：数字人实时解说判定 + 后果 + 正确做法 */
export function notifySandboxStep(entry, idx) {
  const r = entry?.result
  if (!r) return
  const parts = [`第 ${idx + 1} 步，${LEVEL_PREFIX[r.level] || LEVEL_PREFIX.none}`]
  if (r.world_reaction) parts.push(r.world_reaction)
  else if (r.consequence) parts.push(r.consequence)
  if (r.correction && r.level !== 'none') {
    const firstLine = String(r.correction).split('\n').filter(Boolean)[0]
    if (firstLine) parts.push(`正确做法：${firstLine}`)
  }
  speak(parts.join(' '), { expression: LEVEL_EXPR[r.level] || 'calm', ms: 9000 })
}

/** 一轮推演结束（终止或重新开始）：3 句话总结——哪对了、哪错了、下次注意什么 */
export function notifySandboxSummary(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) return
  const total = timeline.length
  const byLevel = { high: 0, medium: 0, low: 0, none: 0 }
  timeline.forEach((t) => { byLevel[t.result?.level || 'none'] = (byLevel[t.result?.level || 'none'] || 0) + 1 })
  const risky = byLevel.high + byLevel.medium
  let summary
  if (risky === 0) {
    summary = `这轮 ${total} 步全部安全，做得漂亮！说明要点你都记住了，下次可以挑战更复杂的场景。`
  } else {
    summary = `这轮一共 ${total} 步：${byLevel.none} 步安全，高危 ${byLevel.high} 步、中危 ${byLevel.medium} 步。`
    const worst = timeline.find((t) => t.result?.level === 'high') || timeline.find((t) => t.result?.level === 'medium')
    if (worst) summary += `最要命的是「${worst.step}」，${worst.result?.consequence || '这一步有风险'}。`
    summary += '下次操作前，先把这几步的正确做法在脑子里过一遍。'
  }
  speak(summary, { expression: risky === 0 ? 'approve' : 'thinking', ms: 10000 })
}

/* ================= 场景 2：学习中心 · 分步骤导师 ================= */

const STAGE_OPENING = {
  pre: '先做一次预考，看看你现在的基础。放心做错，错了正好知道要学什么。',
  sim: '开始分步学习。每一步我先讲要点，你再来选；选错了我不直接给答案，先给你提示。',
  post: '现在来正式考核。刚才练过的要点都想一想，稳住节奏。',
}

/** 进入一个新步骤：数字人先讲原理/要点，再让用户操作 */
export function notifyTrainStep(step, idx, stage) {
  if (!step) return
  const total = step.totalHint || ''
  const intro = idx === 0 ? `${STAGE_OPENING[stage] || STAGE_OPENING.sim} ` : ''
  const hint = step.step_hint ? `要点提示：${step.step_hint}` : (step.step_text || '')
  speak(`${intro}第 ${idx + 1} 步，${step.step_title}。${hint}`, {
    expression: 'focus',
    ms: Math.min(9000, 3000 + (hint.length || 0) * 150),
  })
}

/** 选项揭晓：做对了鼓励，做错了先引导思考（不直接判死刑） */
export function notifyTrainChoice(step, optIdx) {
  const opt = step?.options?.[optIdx]
  if (!opt) return
  if (opt.correct) {
    speak('选对了，就是这个。' + (opt.explanation ? ` ${opt.explanation}` : ''), { expression: 'approve', ms: 7000 })
  } else {
    speak(
      `这个选择有问题。${opt.consequence ? `${opt.consequence} ` : ''}再想想：这一步最该防的是什么？想好了看下面的解析对照一下。`,
      { expression: 'thinking', ms: 8000 },
    )
  }
}

/** 培训结果出来：本次表现点评 */
export function notifyTrainResult(result, stage) {
  if (!result) return
  const score = result.score ?? 0
  const wrong = result.total - (result.correct_count ?? 0)
  let tone, expr
  if (result.passed) { tone = '太棒了，考核通过！'; expr = 'approve' }
  else if (score >= 40) { tone = '有进步，但还差一点。'; expr = 'thinking' }
  else { tone = '这次不太理想，别灰心。'; expr = 'thinking' }
  speak(
    `${tone}本次答对 ${result.correct_count} / ${result.total}，高危答错 ${result.high_risk_wrong} 步。`
    + (wrong > 0 ? `重点看下面${wrong}步的逐步详解，尤其是标红的后果。` : '')
    + (stage === 'pre' ? '预考只是摸底，现在开始学习模拟。' : stage === 'post' && !result.passed ? '建议回学习模拟再练一遍，再考一次。' : ''),
    { expression: expr, ms: 10000 },
  )
}

/* ================= 场景 3：案例库 · 事故讲述人 ================= */

/** 打开一个案例：数字人用讲故事的方式讲述 + 关键节点停顿提问 */
export function notifyCaseStory(item) {
  if (!item) return
  const what = item.behavior || '一个真实的错误操作'
  const why = item.analysis || ''
  speak(
    `给你讲个真实案例。有同学${what}。${why ? `结果是：${why} ` : ''}`
    + '我想先问问你：如果是你做到这一步，你会怎么做？带着这个问题听下面的讲解。',
    { expression: item.risk_level === 'high' ? 'alert' : 'thinking', ms: 12000 },
  )
}

/* ================= 场景 4：我的作业 · 批改助手 ================= */

/** 进入作业页：主动提醒未完成作业 */
export function notifyAssignments(pendingCount) {
  if (!pendingCount || pendingCount <= 0) {
    speak('作业都完成了，没有欠账的感觉很爽吧。要不要去沙盘挑战几个高危场景？', { expression: 'approve', ms: 7000 })
    return
  }
  speak(`提醒一下：你还有 ${pendingCount} 项作业没完成。建议先把最简单的做掉，进入状态。`, { expression: 'calm', ms: 7000 })
}

/** 自测/作业成绩出来：第一时间点评 + 错题引导（对应方案"作业完成后点评"） */
export function notifyQuizResult(result) {
  if (!result) return
  const score = result.score ?? 0
  const wrong = (result.total ?? 0) - (result.correct ?? 0)
  const passed = score >= 60
  let msg
  if (passed && wrong === 0) {
    msg = `全对，${score} 分！这批知识点你算是吃透了。`
  } else if (passed) {
    msg = `这次考了 ${score} 分，通过了。对了 ${result.correct} 题，错了 ${wrong} 题。`
  } else {
    msg = `这次 ${score} 分，差一点到 60。先别灰心，我们看错题。`
  }
  if (wrong > 0) {
    const first = result.wrong_items?.[0]
    msg += first
      ? `错得最可惜的是这道：「${first.question}」。正确答案是 ${first.correct_answer}，解析在下面，看完解析再重新自测一遍。`
      : `共错 ${wrong} 题，解析都在下面，看完再测一遍巩固。`
  }
  speak(msg, { expression: passed ? 'approve' : 'thinking', ms: 11000 })
}

/* ================= 场景 5：文档管理 · 智能解读员 ================= */

/** 打开一篇文档的风险抽取结果：30 秒摘要 + 重点条款 */
export function notifyDocRisks(docTitle, risks) {
  if (!Array.isArray(risks) || risks.length === 0) {
    speak(`「${docTitle || '这篇文档'}」还没有抽取出风险点。上传后系统会自动解析，或者你可以问我还想了解什么。`, { expression: 'calm', ms: 6000 })
    return
  }
  const high = risks.filter((r) => r.level === 'high').length
  const top = risks[0]
  speak(
    `「${docTitle || '这篇文档'}」我帮你划重点：一共抽到 ${risks.length} 条风险点，其中高危 ${high} 条。`
    + `最要紧的一条是：${top.description}。完整清单在下面，每一条都能追溯到原文条款。`,
    { expression: high > 0 ? 'alert' : 'calm', ms: 10000 },
  )
}

/* ================= 场景 6：个人画像 · 成长教练 ================= */

/** 打开个人画像：用数据说话的个性化解读 */
export function notifyProfile(data) {
  if (!data) return
  const total = data.total_records ?? 0
  if (total === 0) {
    speak('你的画像还是一张白纸——这不算坏事，说明还没犯过错。去沙盘推演几步，我们开始记录你的成长。', { expression: 'calm', ms: 8000 })
    return
  }
  const dist = data.risk_distribution || {}
  const weaknesses = data.weaknesses || []
  const rate = data.improvement_rate ?? 0
  let msg = `结合你的 ${total} 条记录说两句：达标率 ${data.pass_rate}%`
  if (rate > 0) msg += `，风险识别能力提升了 ${rate}%，这个趋势很好`
  if (weaknesses.length > 0) {
    msg += `。但「${weaknesses[0].scene_type}」还是你的薄弱项，建议针对性地练一下`
  } else {
    msg += '。目前没有明显短板，可以挑战更高难度的场景'
  }
  speak(msg + '。', { expression: rate > 0 ? 'approve' : 'thinking', ms: 10000 })
}

/* ================= 主动交互（方案第 4 章） ================= */

/** 连续学习时长提醒（Nexus 每 40 分钟触发一次） */
export function notifyStudyFatigue(minutes) {
  speak(`你已经连续学习 ${minutes} 分钟了，眼睛该休息一下。5 分钟后我们再继续，实验安全也讲究劳逸结合。`, { expression: 'calm', ms: 8000 })
}

/* ================= 困惑检测 ================= */

/**
 * 困惑检测：识别学生"卡住了"的信号，主动介入引导。
 *
 * 触发信号（三类）：
 *   1. 重复出错：同一操作/同一道题连续错 2 次以上
 *   2. 长时间停留：同一页面/同一步骤停留 > 阈值（默认 60s）
 *   3. 对话困惑词：用户消息里出现"不懂""不会""太难""卡住了"等
 *
 * 防骚扰：
 *   - 同类困惑 90 秒内只触发一次（cooldown）
 *   - 全局最多每 30 秒一次主动发言（和其他 notifyXxx 共用节流）
 *   - 用户正在说话（speaking=true）时不打断
 */

const CONFUSION_COOLDOWN = 90000  // 同类困惑冷却时间 90s
const MIN_STUCK_SECONDS = 60       // 停留超过 60s 算卡住

const _confusionState = {
  lastTriggerAt: 0,        // 上次触发时间戳
  lastType: '',            // 上次触发类型
  repeatCount: {},         // 按 key 计数重复出错 { key: count }
  stuckTimer: null,        // 停留计时器
  stuckPage: '',           // 当前停留的页面/步骤标识
}

// 困惑词模式：用户说这些话时大概率卡住了
const CONFUSION_PATTERNS = [
  /不懂|不会|太难|搞不懂|不明白|不清楚|不知道/,
  /卡住了|卡壳|卡了|过不去|做不对/,
  /怎么办|怎么弄|怎么搞|什么意思|啥意思/,
  /再讲一遍|再说一遍|没听懂|没听清/,
  /好难|难啊|好复杂|头大|晕了/,
]

function _canTriggerConfusion(type) {
  const now = Date.now()
  // 全局节流：30s 内不重复主动发言
  if (now - _confusionState.lastTriggerAt < 30000) return false
  // 同类冷却：90s 内同类不重复
  if (_confusionState.lastType === type && now - _confusionState.lastTriggerAt < CONFUSION_COOLDOWN) return false
  // 数字人正在说话时不打断
  if (useDigitalHumanStore.getState().speaking) return false
  return true
}

function _markTriggered(type) {
  _confusionState.lastTriggerAt = Date.now()
  _confusionState.lastType = type
}

/** 困惑检测：同一处停留/重复出错时主动询问 */
export function notifyConfusion(hint) {
  if (!_canTriggerConfusion('general')) return
  _markTriggered('general')
  speak(hint || '卡住了吗？需要的话我可以给你一点提示，或者换个角度讲一遍。', { expression: 'worried', ms: 7000 })
}

/**
 * 记录一次错误操作，用于重复出错检测。
 * @param {string} key  错误的唯一标识（比如沙盘 step id、培训题 id）
 * @param {string} hint  触发时说的话
 * @returns {boolean} 是否触发了困惑提示
 */
export function trackMistake(key, hint) {
  if (!key) return false
  _confusionState.repeatCount[key] = (_confusionState.repeatCount[key] || 0) + 1
  const count = _confusionState.repeatCount[key]
  // 连续错 2 次 → 触发困惑提示
  if (count >= 2 && _canTriggerConfusion('repeat')) {
    _markTriggered('repeat')
    speak(
      hint || '这一步已经错两次了，要不要我换个方式讲给你听？或者先看看下面的提示再试试。',
      { expression: 'worried', ms: 8000 },
    )
    // 触发后重置计数，避免一直弹
    _confusionState.repeatCount[key] = 0
    return true
  }
  return false
}

/** 做对了 → 重置该 key 的错误计数 */
export function trackCorrect(key) {
  if (key && _confusionState.repeatCount[key]) {
    delete _confusionState.repeatCount[key]
  }
}

/**
 * 开始计时：用户进入某一步/某一页时调用。
 * 超过阈值后自动触发"卡住了"提示。
 * @param {string} pageKey 页面/步骤标识
 * @param {string} hint  触发时说的话
 * @param {number} [seconds] 自定义阈值（秒），默认 60
 */
export function startStuckTimer(pageKey, hint, seconds) {
  stopStuckTimer()
  _confusionState.stuckPage = pageKey
  const delay = (seconds || MIN_STUCK_SECONDS) * 1000
  _confusionState.stuckTimer = setTimeout(() => {
    if (_canTriggerConfusion('stuck')) {
      _markTriggered('stuck')
      speak(
        hint || '这一步想了挺久了，需要提示吗？点一下「提示」按钮，我给你点线索。',
        { expression: 'worried', ms: 7000 },
      )
    }
  }, delay)
}

/** 停止停留计时（用户操作了、切换页面时调用） */
export function stopStuckTimer() {
  if (_confusionState.stuckTimer) {
    clearTimeout(_confusionState.stuckTimer)
    _confusionState.stuckTimer = null
  }
  _confusionState.stuckPage = ''
}

/**
 * 检测用户消息中的困惑词，聊天时调用。
 * @param {string} text 用户输入的文本
 * @returns {boolean} 是否检测到困惑
 */
export function detectConfusionInText(text) {
  if (!text) return false
  return CONFUSION_PATTERNS.some((p) => p.test(text))
}

/** 重置所有困惑状态（换会话/换模块时用） */
export function resetConfusionState() {
  _confusionState.lastTriggerAt = 0
  _confusionState.lastType = ''
  _confusionState.repeatCount = {}
  stopStuckTimer()
}
