import client from './client'

// 主题内部键 → 面向学生中文标签（与后端 TOPIC_LABELS 保持一致，避免把 dilution/heating_tube 暴露给学生）
export const TOPIC_LABELS = {
  dilution: '浓硫酸稀释',
  heating_tube: '试管加热',
  smell_gas: '闻气体',
  waste: '废液处理',
  reactive_metal: '活泼金属',
  generic: '实验操作',
}

export function topicLabel(key) {
  return TOPIC_LABELS[key] || key || '实验操作'
}

/**
 * 数字人教练 12 项能力前端入口（prefix /companion/coach）。
 *
 * client 响应拦截器已把 {code,message,data} 解包为 data 本体，
 * 因此下面每个函数 return 的就是后端 ok(...) 里的 data 对象，
 * 调用方直接取字段即可（与 companionChat 一致）。
 *
 * 安全口径：所有"风险结论"字段（level / tip / must_warn 等）都来自规则引擎，
 * 本文件只做转发，不重写任何安全结论。
 */
export function coachSocratic({ operationText, studentAnswer = '' }) {
  return client.post('/companion/coach/socratic', {
    operation_text: operationText,
    student_answer: studentAnswer,
  })
}

export function coachHints({ text, level = 0 }) {
  return client.post('/companion/coach/hints', { text, level })
}

export function coachAttribute({ operationText, studentAnswer = '' }) {
  return client.post('/companion/coach/attribute', {
    operation_text: operationText,
    student_answer: studentAnswer,
  })
}

export function coachState({ speed = 2.0, accuracy = 0.8, confusionRate = 0.1 }) {
  return client.post('/companion/coach/state', {
    speed,
    accuracy,
    confusion_rate: confusionRate,
  })
}

export function coachProfile() {
  return client.get('/companion/coach/profile')
}

export function coachWeakReminder(topic = '') {
  return client.get('/companion/coach/weak-reminder', { params: { topic } })
}

export function coachEmotion({ text = '', signals = {} }) {
  return client.post('/companion/coach/emotion', { text, signals })
}

export function coachInterrupt(sessionId = 'default') {
  return client.post('/companion/coach/interrupt', { session_id: sessionId })
}

export function coachInterruptStatus(sessionId = 'default') {
  return client.get('/companion/coach/interrupt/status', { params: { session_id: sessionId } })
}

export function coachSpeechRate() {
  return client.get('/companion/coach/speech-rate')
}

export function coachSetPrefs(prefs) {
  return client.post('/companion/coach/prefs', { prefs })
}

export function coachBadges() {
  return client.get('/companion/coach/badges')
}

export function coachAward(event = 'experiment_done') {
  // 注意：axios post 第三参是 config，query 放 params
  return client.post('/companion/coach/award', null, { params: { event } })
}

export function coachVisionCheck({ frameDescription, question = '' }) {
  return client.post('/companion/coach/vision-check', {
    frame_description: frameDescription,
    question,
  })
}

export function coachVisionAsk({ frameDescription, question = '' }) {
  return client.post('/companion/coach/vision-ask', {
    frame_description: frameDescription,
    question,
  })
}

export default {
  coachSocratic,
  coachHints,
  coachAttribute,
  coachState,
  coachProfile,
  coachWeakReminder,
  coachEmotion,
  coachInterrupt,
  coachInterruptStatus,
  coachSpeechRate,
  coachSetPrefs,
  coachBadges,
  coachAward,
  coachVisionCheck,
  coachVisionAsk,
}
