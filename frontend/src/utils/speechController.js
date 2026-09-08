// 单路语音播放控制器（修复"双 TTS 唱双簧"）+ 语速自适应 + 自动语音打断（VAD）。
//
// 职责：
//   1. 单路播放：任何一次 playSpeech 先 stopSpeech() 取消在途播放，保证同一时刻只有一路发声，
//      无论多少个组件订阅 caption（修双 TTS 的关键）。
//   2. 语速自适应：speechRateScale 由后端 /speech-rate 经 setSpeechRate 注入，
//      叠加到表情基础语速上透传给 TTS（项8）。
//   3. 自动语音打断（barge-in，项7）：TTS 播放时持续监听麦克风音量 onset，
//      检测到用户开口即 stopSpeech() 并回调 interruptHandler（前端调 /interrupt 标记）。
//
// 听感三原则（用户反馈：间隔大 / 旧话不打断 / 音色跳变）：
//   a. 整段一次合成：不再把文本切成小句逐句请求后端 TTS（每次都要 fork edge-tts 子进程 +
//      网络往返 + 人为 pause），而是整段生成一个 mp3 连续播放 → 无句间空隙；
//   b. 音色统一：整段要么全走晓晓、要么整体回退浏览器语音，绝不句级混音；
//   c. 新输入即打断：发送新消息时外部会调 hush() → stopSpeech() 立即停掉旧朗读。
//
// 安全口径：本模块只管"怎么发声 / 何时停"，所有安全结论仍来自规则引擎，这里不生产任何文案。
import { neuralSpeak, baseRatePct, hasPreferredZhVoice, ensureZhVoicesLoaded, pickBestZhVoice } from './neuralTTS'
import { stripMarkdownMarks } from './cleanTalk'
import { useDigitalHumanStore } from '../store/digitalHumanStore'

let currentAudio = null
let currentUrl = null       // 当前 blob URL（stop 时一并 revoke，避免累积）
let segmentCancel = false
let voiceUnlocked = false
let resolvePlay = null     // 当前播放 Promise 的 resolve（供 stopSpeech 中断等待）

let speechRateScale = 1.0          // 语速倍率（0.7~1.3），由后端 /speech-rate 注入
let bargeInEnabled = true          // 是否开启自动语音打断
let interruptHandler = null        // 检测到用户开口时回调（通常 POST /companion/coach/interrupt）

// "强制晓晓（后端）"兜底开关：为 true 时跳过"浏览器自然音优先"策略，
// 强制走后端 edge-tts（晓晓/云希），防止浏览器机械音当主音色。localStorage 持久化。
const FORCE_EDGE_KEY = 'dh_force_edge_tts'
let forceEdgeTTS = (function () {
  try { return localStorage.getItem(FORCE_EDGE_KEY) === '1' } catch (_) { return false }
})()

// VAD 相关
let vadStream = null
let vadCtx = null
let vadAnalyser = null
let vadRAF = null
let vadTriggered = false
let vadFrames = 0            // 连续超阈值帧计数（去抖，避免单帧尖峰误触发）
const VAD_THRESHOLD = 0.15   // RMS 阈值（比环境底噪高，但低于正常说话）
const VAD_DEBOUNCE_FRAMES = 3 // 需连续 N 帧超阈值才判定为"用户开口"

export function setVoiceUnlocked(v) { voiceUnlocked = v }
export function isVoiceUnlocked() { return voiceUnlocked }

/** 注入语速倍率（项8 语速自适应），夹在 [0.7, 1.3] */
export function setSpeechRate(scale) {
  const s = Number(scale)
  if (!Number.isNaN(s)) speechRateScale = Math.max(0.7, Math.min(1.3, s))
}

export function getSpeechRate() { return speechRateScale }

/** 设置检测到用户开口时的回调（通常用来 POST /interrupt 标记会话） */
export function setInterruptHandler(fn) { interruptHandler = fn }

/** 开关自动语音打断 */
export function setBargeInEnabled(v) { bargeInEnabled = !!v }
export function isBargeInEnabled() { return bargeInEnabled }

/** 开关"强制晓晓（后端）"：开 → 全程走后端 edge-tts（音质好、不受浏览器机械音影响） */
export function setForceEdgeTTS(v) {
  forceEdgeTTS = !!v
  try { localStorage.setItem(FORCE_EDGE_KEY, forceEdgeTTS ? '1' : '0') } catch (_) {}
  if (forceEdgeTTS) {
    // 强制后端时若正用浏览器语音在播，立即停掉，下句自然走后端
    stopSpeech()
  }
}
export function isForceEdgeTTS() { return forceEdgeTTS }

function _scaleRate(expression, scale) {
  const pct = baseRatePct(expression)
  const finalPct = Math.round(pct * scale)
  return (finalPct >= 0 ? '+' : '') + finalPct + '%'
}

/**
 * 首句先行切块：
 *   第 1 块 = 尽量短的首个完整句（≤70 字），让它尽快出音频、尽快开口；
 *   第 2+ 块 = 剩余正文（单块 ≤1600 字，超过再按句切）。
 *   返回 [{ text }...]
 */
function _leadChunkForTTS(text) {
  const MAX = 1600
  const t = (text || '').trim()
  if (!t) return []
  // 很短直接整段
  if (t.length <= 120) return [{ text: t }]

  // 取第一个自然停顿（。！？…；）位置作为首句，尽量短但别短到不成句
  const m = t.match(/[^。！？…；]*[。！？…；]/)
  let head = (m && m[0] || t).trim()
  if (!head) head = t.slice(0, 50)
  if (head.length > 50) {
    // 首句过长（比如没有标点的一长段）→ 砍到 45 字，尽快开口
    head = head.slice(0, 45)
  }
  let rest = t.slice(head.length).trim()

  const chunks = [{ text: head }]
  while (rest.length > MAX) {
    let cut = rest.lastIndexOf('。', MAX)
    if (cut < MAX * 0.5) cut = rest.lastIndexOf('，', MAX)
    if (cut < MAX * 0.5) cut = MAX
    const idx = cut + 1
    chunks.push({ text: rest.slice(0, idx) })
    rest = rest.slice(idx)
  }
  if (rest) chunks.push({ text: rest })
  return chunks
}

export function stopSpeech() {
  segmentCancel = true
  _stopVAD()
  if (currentAudio) {
    try { currentAudio.pause() } catch (_) {}
    currentAudio = null
  }
  if (currentUrl) {
    try { URL.revokeObjectURL(currentUrl) } catch (_) {}
    currentUrl = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try { window.speechSynthesis.cancel() } catch (_) {}
  }
  // 让正在等待播放结束的 Promise 立刻返回（否则 hush 后 setSpeaking 永远不清）
  if (resolvePlay) {
    try { resolvePlay() } catch (_) {}
    resolvePlay = null
  }
}

/**
 * 麦克风音量活动检测（VAD）：TTS 播放期间监听用户是否开口，
 * 一旦音量超过阈值即视为"用户想插话"，停止当前播放并触发打断回调。
 */
function _startVAD() {
  if (!bargeInEnabled || vadStream) return
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return
  if (!window.AudioContext && !window.webkitAudioContext) return

  vadTriggered = false
  vadFrames = 0
  // 开启回声消除/噪声抑制：数字人自己的扬声器声音会被 AEC 滤掉，避免"自己打断自己"。
  // 注意：AEC 在多数浏览器对同设备扬声器+麦克风有效，但不能 100% 消除，
  // 因此再叠加"连续 N 帧超阈值"去抖，进一步降低误触发。
  navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
  })
    .then((stream) => {
      vadStream = stream
      const Ctx = window.AudioContext || window.webkitAudioContext
      vadCtx = new Ctx()
      const src = vadCtx.createMediaStreamSource(stream)
      vadAnalyser = vadCtx.createAnalyser()
      vadAnalyser.fftSize = 512
      src.connect(vadAnalyser)
      const data = new Uint8Array(vadAnalyser.fftSize)

      const loop = () => {
        if (!vadAnalyser) return
        vadAnalyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        if (!vadTriggered && rms > VAD_THRESHOLD) {
          vadFrames += 1
          if (vadFrames >= VAD_DEBOUNCE_FRAMES) {
            vadTriggered = true
            if (interruptHandler) {
              try { interruptHandler() } catch (_) {}
            }
            stopSpeech()
            return
          }
        } else {
          vadFrames = 0
        }
        vadRAF = requestAnimationFrame(loop)
      }
      vadRAF = requestAnimationFrame(loop)
    })
    .catch(() => {
      // 麦克风不可用 / 用户拒绝授权：自动打断静默降级，不阻塞主流程
      vadStream = null
    })
}

function _stopVAD() {
  if (vadRAF) { cancelAnimationFrame(vadRAF); vadRAF = null }
  if (vadStream) {
    vadStream.getTracks().forEach((t) => t.stop())
    vadStream = null
  }
  if (vadCtx) { try { vadCtx.close() } catch (_) {} vadCtx = null }
  vadAnalyser = null
}

/**
 * TTS 文本净化：去掉屏幕上的"动作描写/旁白"（只用于在屏幕传递动作感，不应朗读）。
 *   例："（眨眨眼）要不要现在画图？" → "要不要现在画图？"
 *   例："（低头）" / "（停顿一下）" / "（示意）" 都会清掉
 *
 * 字幕 (caption) 不受影响——store.speak 用的仍是原始文本，屏幕照样看得到"（眨眨眼）"。
 * 仅在送进 TTS 引擎前清洗一次。判定靠括号内是否含常见动作/表情/拟声词。
 */
const _STAGE_DIRECTION_HINTS = /(眨|看|笑|叹|低|抬|转|做|伸|手|点头|摇头|停顿|思考|皱眉|翻|瞄|瞥|抿|咳嗽|清嗓|思索|沉默|扮|比|摆|挥手|回头|示意|捂|嘟|噘|翻白|咧嘴|转身|起身|坐下|站起来|走下去|走开|抬手|放下|插|靠|歪|偏|张|闭|举|放|展开|握|碰|摸|抖|颤|耸肩|摊手|拍|点|敲|抱|捧|扔|捡|掏|拖|拽|推|拉|惊|吓|哭|气|恼|羞|愣|呆|懵|犹豫|迟疑|扫|瞪|盯|怒|微笑|苦笑|冷笑|偷笑|示意)/

export function cleanTextForTTS(text) {
  if (!text) return text
  // 1) 去掉 (…)/（…）包裹的动作/旁白（短句才动它，< 30 字避免误伤内容）
  // 2) 再清掉 LLM 输出里可能夹带的 markdown 强调/代码标记（** * _ ` ~~），
  //    避免被 TTS 念成"加加星号"或在屏幕上显示成奇怪符号
  let s = text.replace(/[（(]([^()（）\n]{1,30}?)[)）]/g, (m, inner) =>
    _STAGE_DIRECTION_HINTS.test(inner) ? '' : m
  )
  s = stripMarkdownMarks(s)
  s = s.replace(/[ \t]{2,}/g, ' ').trim()
  return s
}

/**
 * 单路播放：首句先行 + 流水线预取，保证"开口快 + 音色统一"。
 *
 * 为什么这样设计（针对用户两次反馈）：
 *   1. 开口慢：旧方案整段一次合成，几百字要等 edge-tts 全部生成完（3~6s）才开始发声。
 *      现在把第一个完整句拆出来先合成（短 → 1~2s 出音频），立刻开播；
 *      播放第一句的间隙里后台预取剩余正文，播完无缝接续 → 用户感觉"马上开口"。
 *   2. 音色跳变：旧方案整段后端生成，失败/超时就整段回退浏览器语音 → 一会儿晓晓一会儿浏览器音色。
 *      现在以第一块结果锁定音源：首块成功 → 后续全部走后端晓晓；首块失败 → 整段统一浏览器语音。
 *      同一段回答绝不会中途换人。
 *
 * 任何时刻只有一个 playSpeech 在播放（新调用先取消旧的）。
 */
export async function playSpeech(text, expression) {
  const store = useDigitalHumanStore.getState()
  if (!text || store.muted || !voiceUnlocked) return

  stopSpeech() // 取消在途播放 —— 双 TTS 修复 + 新消息打断的关键
  segmentCancel = false

  // 屏幕上的"动作描写/旁白"（如 （眨眨眼）（低头）（停顿一下））只用于在屏幕传递动作感，
  // 不该让 TTS 真念出来。字幕（caption）已经在 store.speak 里用原文设置过，这里只清洗朗读副本。
  const ttsText = cleanTextForTTS(text)
  if (!ttsText) {
    store.setSpeaking(false)
    return
  }

  const chunks = _leadChunkForTTS(ttsText)
  if (!chunks.length) {
    store.setSpeaking(false)
    return
  }

  store.setSpeaking(true)
  _startVAD() // 播放期间开启自动打断监听

  // 音源决策（自动选优，保证"自然好听 + 稳定同声"）：
  //   1. 浏览器有"自然级"中文语音（微软晓晓/在线 neural 等）→ 全程浏览器（同一好音色、零延迟、不依赖后端网络）；
  //   2. 否则默认走后端 edge-tts（晓晓，自然音质好）—— 只有浏览器机械音时绝不优先用它（会"人机感"）；
  //   3. 后端也失败 → 才退回浏览器任意中文音（保底能出声）。
  let engine = null // 'edge' | 'web'

  await ensureZhVoicesLoaded()
  // 强制晓晓开关开启 → engine 锁定 'edge'，无论浏览器有无自然音都不走浏览器
  if (forceEdgeTTS) {
    engine = 'edge'
  } else {
    const naturalWebVoice = !segmentCancel && hasPreferredZhVoice() // 仅自然音才可当主音色
    if (naturalWebVoice) engine = 'web'
  }

  const rate = _scaleRate(expression || 'calm', speechRateScale)

  // 需要后端时：合成第 0 块（首句，短）→ 尽快开口
  let firstUrl = null
  if (engine === 'web') {
    firstUrl = null // 浏览器自然音语音不走后端
  } else {
    try {
      // 强制晓晓 → 传 forceEdge:true，后端失败会抛错（绝不降级人机音）
      firstUrl = await neuralSpeak(chunks[0].text, expression || 'calm', { rate, forceEdge: forceEdgeTTS })
      if (segmentCancel) { _finishPlay(store); return }
      if (typeof firstUrl === 'string' && firstUrl.startsWith('webspeech:')) {
        // 自动模式下若后端把首块降级成了浏览器语音 → 后续块保持一致走浏览器（自然音优先）
        engine = 'web'
        firstUrl = null
      }
    } catch (_) {
      if (forceEdgeTTS) {
        // 强制晓晓且后端失败：宁可不发声也不换人机音。字幕已显示，静默结束本次朗读。
        _finishPlay(store)
        return
      }
      // 自动模式后端不可用 → 浏览器兜底出声（_playUtterance 内部仍优先自然音，其次才机械音）
      engine = 'web'
    }
  }
  if (segmentCancel) { _finishPlay(store); return }

  // 流水线：播放第 idx 块期间，后台预合成第 idx+1 块 → 块间几乎无缝（预取掩盖合成耗时）
  const prefetch = (idx) => {
    if (!chunks[idx] || engine !== 'edge') return null
    return neuralSpeak(chunks[idx].text, expression || 'calm', { rate, forceEdge: forceEdgeTTS })
      .then((u) => (typeof u === 'string' && u.startsWith('webspeech:')) ? null : u)
      .catch(() => null)
  }

  // 启动播放第 0 块（首句）——已经合成好了，立即出声
  let curPlay = null
  if (engine === 'edge' && firstUrl) {
    curPlay = _playBlob(firstUrl)
  } else if (engine === 'web') {
    curPlay = _playUtterance(chunks[0].text, expression)
  }
  // 第 0 块播放的同时，后台预合成第 1 块
  let nextPromise = prefetch(1)

  // 逐块播放：播完当前块 → 等下一块预取结果（通常早已就绪）→ 无缝接续
  for (let idx = 1; idx < chunks.length; idx++) {
    if (segmentCancel) break
    if (curPlay) {
      try { await curPlay } catch (_) {}
      curPlay = null
    }
    if (segmentCancel) break

    // 取第 idx 块：edge 用预取音频；web 直接浏览器朗读
    let url = null
    if (engine === 'edge') {
      url = nextPromise ? await nextPromise : null
      nextPromise = prefetch(idx + 1) // 提前预取再下一块
    }
    if (segmentCancel) break

    if (engine === 'edge' && url) {
      curPlay = _playBlob(url)
    } else if (engine === 'web') {
      curPlay = _playUtterance(chunks[idx].text, expression)
    }
    // edge 且该块没取到音频 → 跳过该块内容（宁缺毋滥，不换音色），进入下一轮
  }

  // 等最后一块播完
  if (curPlay) {
    try { await curPlay } catch (_) {}
  }

  _finishPlay(store)
}

function _finishPlay(store) {
  _stopVAD()
  if (!segmentCancel) {
    try { (store || useDigitalHumanStore.getState()).setSpeaking(false) } catch (_) {}
  }
}

/** 播放一段 blob 音频到自然结束（可被 stopSpeech 中断） */
function _playBlob(url) {
  return new Promise((resolve, reject) => {
    resolvePlay = resolve
    currentUrl = url
    const audio = new Audio(url)
    currentAudio = audio
    const cleanup = () => {
      resolvePlay = null
      if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null }
      currentAudio = null
    }
    audio.onended = () => { cleanup(); resolve() }
    audio.onerror = () => { cleanup(); reject(new Error('audio error')) }
    audio.play().catch((e) => { cleanup(); reject(e) })
  })
}

/** 浏览器 Web Speech 兜底播放一段（统一固定一个中文音色：自然音优先、机械音最后兜底） */
function _playUtterance(text, expression) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    const best = pickBestZhVoice()
    if (best) utter.voice = best
    const absRate = Math.max(0.5, Math.min(2, 1 + baseRatePct(expression || 'calm') * speechRateScale / 100))
    utter.rate = absRate
    resolvePlay = resolve
    utter.onend = () => { resolvePlay = null; resolve() }
    utter.onerror = () => { resolvePlay = null; resolve() }
    window.speechSynthesis.speak(utter)
  })
}

// 首次用户交互后解锁浏览器自动播放限制（全局仅注册一次）
if (typeof window !== 'undefined') {
  const unlock = () => {
    voiceUnlocked = true
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}
