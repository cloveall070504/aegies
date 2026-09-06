import { useEffect, useRef, useState, useCallback } from 'react'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { neuralSpeak, splitSentences } from '../utils/neuralTTS'

/**
 * 数字人中心舞台（屏幕 C 位）· 科技蜂窝脸版
 *
 * 设计：
 *  1. 圆形脸 + 蜂窝纹理 + 椭圆眼 + 线条眉 + 简洁嘴
 *  2. 自动眨眼（CSS transform: scaleY）
 *  3. 不说话时嘴不动
 *  4. 说话时嘴部开合动画
 *  5. 表情系统：neutral / happy / thinking / surprised
 *  6. TTS 语音合成
 */

let cachedVoice = null

function getVoice() {
  if (cachedVoice) return cachedVoice
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices() || []
  if (!voices.length) return null
  const zh = voices.filter(
    (v) =>
      v.lang &&
      (v.lang.toLowerCase().startsWith('zh') ||
        v.lang.toLowerCase().startsWith('cmn') ||
        v.lang.toLowerCase().startsWith('zh-cn'))
  )
  // 优先选高质量语音（名字含 Natural/Neural/Ting/Enhanced）
  const preferred =
    zh.find((v) => /ting|natural|neural|enhanced/i.test(v.name)) ||
    zh.find((v) => /xiao|yue|ling|hui|mei|na|female|woman|girl/i.test(v.name)) ||
    zh[0] ||
    voices[0]
  cachedVoice = preferred
  return cachedVoice
}

const EXPRESSIONS = {
  neutral: {
    leftEye: { cx: 80, cy: 92, rx: 11, ry: 3.5 },
    rightEye: { cx: 120, cy: 92, rx: 11, ry: 3.5 },
    leftBrow: { x1: 70, y1: 80, x2: 90, y2: 80 },
    rightBrow: { x1: 110, y1: 80, x2: 130, y2: 80 },
    mouth: 'M 85 120 Q 100 125 115 120',
  },
  calm: {
    leftEye: { cx: 80, cy: 92, rx: 11, ry: 3.5 },
    rightEye: { cx: 120, cy: 92, rx: 11, ry: 3.5 },
    leftBrow: { x1: 70, y1: 80, x2: 90, y2: 80 },
    rightBrow: { x1: 110, y1: 80, x2: 130, y2: 80 },
    mouth: 'M 85 120 Q 100 125 115 120',
  },
  happy: {
    leftEye: { cx: 80, cy: 90, rx: 11, ry: 2.5 },
    rightEye: { cx: 120, cy: 90, rx: 11, ry: 2.5 },
    leftBrow: { x1: 70, y1: 75, x2: 90, y2: 78 },
    rightBrow: { x1: 110, y1: 78, x2: 130, y2: 75 },
    mouth: 'M 78 117 Q 100 133 122 117',
  },
  alert: {
    leftEye: { cx: 80, cy: 90, rx: 11, ry: 2.5 },
    rightEye: { cx: 120, cy: 90, rx: 11, ry: 2.5 },
    leftBrow: { x1: 70, y1: 75, x2: 90, y2: 78 },
    rightBrow: { x1: 110, y1: 78, x2: 130, y2: 75 },
    mouth: 'M 78 117 Q 100 133 122 117',
  },
  thinking: {
    leftEye: { cx: 80, cy: 92, rx: 11, ry: 2 },
    rightEye: { cx: 120, cy: 90, rx: 11, ry: 3 },
    leftBrow: { x1: 72, y1: 77, x2: 92, y2: 83 },
    rightBrow: { x1: 108, y1: 83, x2: 128, y2: 76 },
    mouth: 'M 88 122 Q 100 122 112 122',
  },
  focus: {
    leftEye: { cx: 80, cy: 92, rx: 11, ry: 2 },
    rightEye: { cx: 120, cy: 90, rx: 11, ry: 3 },
    leftBrow: { x1: 72, y1: 77, x2: 92, y2: 83 },
    rightBrow: { x1: 108, y1: 83, x2: 128, y2: 76 },
    mouth: 'M 88 122 Q 100 122 112 122',
  },
  approve: {
    leftEye: { cx: 80, cy: 90, rx: 11, ry: 2.5 },
    rightEye: { cx: 120, cy: 90, rx: 11, ry: 2.5 },
    leftBrow: { x1: 70, y1: 75, x2: 90, y2: 78 },
    rightBrow: { x1: 110, y1: 78, x2: 130, y2: 75 },
    mouth: 'M 78 117 Q 100 133 122 117',
  },
  surprised: {
    leftEye: { cx: 80, cy: 92, rx: 7, ry: 7 },
    rightEye: { cx: 120, cy: 92, rx: 7, ry: 7 },
    leftBrow: { x1: 68, y1: 71, x2: 92, y2: 71 },
    rightBrow: { x1: 108, y1: 71, x2: 130, y2: 71 },
    mouth: 'M 94 118 Q 100 132 106 118',
  },
}

// ---- 表情过渡动画工具 ----
const EXPR_DURATION = 400
// easeOutBack：起步快、末端微回弹，适合微表情
const c1 = 1.70158, c3 = c1 + 1
const easeOutBack = (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
const lerp = (a, b, t) => a + (b - a) * t

// ---- 语音情感联动：表情 → 语速/音调映射 ----
const VOICE_PROFILES = {
  neutral:  { rate: 0.96, pitch: 1.0  },
  calm:     { rate: 0.88, pitch: 0.96 },
  happy:    { rate: 1.08, pitch: 1.12 },
  alert:    { rate: 1.15, pitch: 1.08 },
  thinking: { rate: 0.78, pitch: 0.9  },
  focus:    { rate: 0.84, pitch: 0.94 },
  approve:  { rate: 1.0,  pitch: 1.06 },
  surprised:{ rate: 1.2,  pitch: 1.22 },
}

function parseMouth(d) {
  const m = d.match(/M\s+([\d.]+)\s+([\d.]+)\s+Q\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (!m) return null
  return { x1: +m[1], y1: +m[2], cx: +m[3], cy: +m[4], x2: +m[5], y2: +m[6] }
}
const buildMouth = (p) => `M ${p.x1.toFixed(2)} ${p.y1.toFixed(2)} Q ${p.cx.toFixed(2)} ${p.cy.toFixed(2)} ${p.x2.toFixed(2)} ${p.y2.toFixed(2)}`

export default function DigitalHumanStage({ emerged = false }) {
  const { caption, speaking, expression, muted, toggleMuted, hush } = useDigitalHumanStore()
  const [unlocked, setUnlocked] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const svgRef = useRef(null)
  const blinkTimerRef = useRef(null)
  const animRef = useRef(null)

  const applyExpr = useCallback((expr) => {
    const svg = svgRef.current
    if (!svg) return

    const target = EXPRESSIONS[expr] || EXPRESSIONS.neutral

    // 缓存 DOM 引用，避免每帧 querySelectorAll
    const leGlow = svg.querySelector('#left-eye ellipse:first-child')
    const leCore = svg.querySelector('#left-eye ellipse:last-child')
    const reGlow = svg.querySelector('#right-eye ellipse:first-child')
    const reCore = svg.querySelector('#right-eye ellipse:last-child')
    const lbEl = svg.querySelector('#left-brow')
    const rbEl = svg.querySelector('#right-brow')
    const mEl = svg.querySelector('#mouth path')
    if (!leCore || !reCore || !lbEl || !rbEl || !mEl) return

    // 读取当前 SVG 上的值作为起点
    const from = {
      le: { cx: +leCore.getAttribute('cx'), cy: +leCore.getAttribute('cy'), rx: +leCore.getAttribute('rx'), ry: +leCore.getAttribute('ry') },
      re: { cx: +reCore.getAttribute('cx'), cy: +reCore.getAttribute('cy'), rx: +reCore.getAttribute('rx'), ry: +reCore.getAttribute('ry') },
      lb: { x1: +lbEl.getAttribute('x1'), y1: +lbEl.getAttribute('y1'), x2: +lbEl.getAttribute('x2'), y2: +lbEl.getAttribute('y2') },
      rb: { x1: +rbEl.getAttribute('x1'), y1: +rbEl.getAttribute('y1'), x2: +rbEl.getAttribute('x2'), y2: +rbEl.getAttribute('y2') },
      mo: parseMouth(mEl.getAttribute('d')),
    }

    const toMouth = parseMouth(target.mouth)
    if (!from.mo || !toMouth) {
      leGlow && leGlow.setAttribute('rx', target.leftEye.rx * 1.36); leGlow && leGlow.setAttribute('ry', target.leftEye.ry * 1.71)
      leCore.setAttribute('cx', target.leftEye.cx); leCore.setAttribute('cy', target.leftEye.cy); leCore.setAttribute('rx', target.leftEye.rx); leCore.setAttribute('ry', target.leftEye.ry)
      reGlow && reGlow.setAttribute('rx', target.rightEye.rx * 1.36); reGlow && reGlow.setAttribute('ry', target.rightEye.ry * 1.71)
      reCore.setAttribute('cx', target.rightEye.cx); reCore.setAttribute('cy', target.rightEye.cy); reCore.setAttribute('rx', target.rightEye.rx); reCore.setAttribute('ry', target.rightEye.ry)
      lbEl.setAttribute('x1', target.leftBrow.x1); lbEl.setAttribute('y1', target.leftBrow.y1); lbEl.setAttribute('x2', target.leftBrow.x2); lbEl.setAttribute('y2', target.leftBrow.y2)
      rbEl.setAttribute('x1', target.rightBrow.x1); rbEl.setAttribute('y1', target.rightBrow.y1); rbEl.setAttribute('x2', target.rightBrow.x2); rbEl.setAttribute('y2', target.rightBrow.y2)
      mEl.setAttribute('d', target.mouth)
      return
    }

    if (animRef.current) cancelAnimationFrame(animRef.current)

    const start = performance.now()
    const lerpObj = (a, b, t) => { const r = {}; for (const k in a) r[k] = lerp(a[k], b[k], t); return r }

    const tick = (now) => {
      const t = Math.min(1, (now - start) / EXPR_DURATION)
      const e = easeOutBack(t)

      const le = lerpObj(from.le, target.leftEye, e)
      const re = lerpObj(from.re, target.rightEye, e)
      const lb = lerpObj(from.lb, target.leftBrow, e)
      const rb = lerpObj(from.rb, target.rightBrow, e)
      const mo = {
        x1: lerp(from.mo.x1, toMouth.x1, e),
        y1: lerp(from.mo.y1, toMouth.y1, e),
        cx: lerp(from.mo.cx, toMouth.cx, e),
        cy: lerp(from.mo.cy, toMouth.cy, e),
        x2: lerp(from.mo.x2, toMouth.x2, e),
        y2: lerp(from.mo.y2, toMouth.y2, e),
      }

      // 直接操作缓存的 DOM 引用，无 querySelectorAll
      if (leGlow) { leGlow.setAttribute('rx', (le.rx * 1.36).toFixed(2)); leGlow.setAttribute('ry', (le.ry * 1.71).toFixed(2)) }
      leCore.setAttribute('cx', le.cx.toFixed(2)); leCore.setAttribute('cy', le.cy.toFixed(2)); leCore.setAttribute('rx', le.rx.toFixed(2)); leCore.setAttribute('ry', le.ry.toFixed(2))
      if (reGlow) { reGlow.setAttribute('rx', (re.rx * 1.36).toFixed(2)); reGlow.setAttribute('ry', (re.ry * 1.71).toFixed(2)) }
      reCore.setAttribute('cx', re.cx.toFixed(2)); reCore.setAttribute('cy', re.cy.toFixed(2)); reCore.setAttribute('rx', re.rx.toFixed(2)); reCore.setAttribute('ry', re.ry.toFixed(2))
      lbEl.setAttribute('x1', lb.x1.toFixed(2)); lbEl.setAttribute('y1', lb.y1.toFixed(2)); lbEl.setAttribute('x2', lb.x2.toFixed(2)); lbEl.setAttribute('y2', lb.y2.toFixed(2))
      rbEl.setAttribute('x1', rb.x1.toFixed(2)); rbEl.setAttribute('y1', rb.y1.toFixed(2)); rbEl.setAttribute('x2', rb.x2.toFixed(2)); rbEl.setAttribute('y2', rb.y2.toFixed(2))
      mEl.setAttribute('d', buildMouth(mo))

      if (t < 1) animRef.current = requestAnimationFrame(tick)
      else animRef.current = null
    }
    animRef.current = requestAnimationFrame(tick)
  }, [])

  // 表情切换
  useEffect(() => {
    applyExpr(expression)
  }, [expression, applyExpr])

  // 卸载时取消动画帧
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current) }, [])

  // 自动眨眼
  useEffect(() => {
    const blink = () => {
      const svg = svgRef.current
      if (!svg) return
      const eyes = svg.querySelectorAll('#left-eye, #right-eye')
      eyes.forEach((g) => {
        g.classList.add('dh-blinking')
        setTimeout(() => g.classList.remove('dh-blinking'), 160)
      })
    }

    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 4000
      blinkTimerRef.current = setTimeout(() => {
        blink()
        if (Math.random() < 0.15) setTimeout(blink, 200)
        scheduleBlink()
      }, delay)
    }
    scheduleBlink()

    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current)
    }
  }, [])

  // 等待中文语音包加载
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (getVoice()) {
      setVoiceReady(true)
      return
    }
    const onVoices = () => {
      if (getVoice()) setVoiceReady(true)
    }
    window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    window.speechSynthesis.getVoices()
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
  }, [])

  // 用户首次点击/按键，解锁浏览器自动播放限制
  useEffect(() => {
    const unlock = () => {
      setUnlocked(true)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // 字幕变化时朗读（神经语音 + 分句 + 自然停顿）
  const audioRef = useRef(null)
  useEffect(() => {
    if (!caption) return
    if (!unlocked) return
    // 静音模式：只显示字幕，不播语音
    if (muted) return

    const segments = splitSentences(caption)
    if (!segments.length) return

    const curExpr = useDigitalHumanStore.getState().expression || 'neutral'
    let cancelled = false
    let timeoutId = null
    let currentBlobUrl = null

    // 停止之前的播放
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
    useDigitalHumanStore.getState().setSpeaking(true)

    async function playSegment(i) {
      if (cancelled) return
      if (i >= segments.length) {
        useDigitalHumanStore.getState().setSpeaking(false)
        useDigitalHumanStore.getState().hush()
        return
      }

      const seg = segments[i]
      try {
        const url = await neuralSpeak(seg.text, curExpr)
        if (cancelled) return

        // Web Speech API 兜底（neuralSpeak 三级降级后返回 webspeech: 前缀）
        if (typeof url === 'string' && url.startsWith('webspeech:')) {
          const utter = new SpeechSynthesisUtterance(seg.text)
          utter.lang = 'zh-CN'
          utter.rate = 1.1
          if (getVoice()) utter.voice = getVoice()
          audioRef.current = {
            _webSpeech: true,
            pause() { window.speechSynthesis.cancel() },
          }
          utter.onend = () => {
            if (cancelled) return
            timeoutId = setTimeout(() => playSegment(i + 1), seg.pause)
          }
          utter.onerror = () => {
            console.warn('[DigitalHuman] Web Speech error, skipping')
            if (cancelled) return
            timeoutId = setTimeout(() => playSegment(i + 1), 500)
          }
          window.speechSynthesis.speak(utter)
          return
        }

        currentBlobUrl = url
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(url)
          if (cancelled) return
          timeoutId = setTimeout(() => playSegment(i + 1), seg.pause)
        }
        audio.onerror = () => {
          console.warn('[DigitalHuman] audio error, skipping')
          if (cancelled) return
          timeoutId = setTimeout(() => playSegment(i + 1), 500)
        }
        audio.play()
      } catch (err) {
        console.warn('[DigitalHuman] TTS failed completely:', err)
        // 完全不可用，跳过当前句
        timeoutId = setTimeout(() => playSegment(i + 1), 500)
      }
    }

    playSegment(0)

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [caption, unlocked, muted])

  // 外部切模块（hush）时同步停掉语音
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }, [speaking])

  return (
    <div className="dh-stage" data-expression={expression}>
      {/* 环境光晕 */}
      <div className={`dh-halo${speaking ? ' dh-halo--speaking' : ''}`} />

      {/* 科技蜂窝数字人 */}
      <div
        className={`dh-figure${emerged ? ' dh-figure--in' : ''}${
          speaking ? ' dh-figure--speaking' : ''
        }`}
      >
        <svg
          ref={svgRef}
          className="dh-svg"
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="AI数字人向导"
        >
          <defs>
            <linearGradient id="dhHeadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.7" />
            </linearGradient>
            <radialGradient id="dhFaceGrad" cx="50%" cy="35%" r="55%">
              <stop offset="0%" stopColor="#0d1224" />
              <stop offset="60%" stopColor="#111827" />
              <stop offset="100%" stopColor="#1a1a2e" />
            </radialGradient>
            <filter id="dhGlow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="dhHexPattern" x="0" y="0" width="14" height="12.12" patternUnits="userSpaceOnUse">
              <polygon points="7,0 14,3.54 14,8.58 7,12.12 0,8.58 0,3.54" fill="none" stroke="rgba(0,229,255,0.05)" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* 圆形脸部 */}
          <circle cx="100" cy="100" r="75" fill="url(#dhFaceGrad)" stroke="url(#dhHeadGrad)" strokeWidth="2" filter="url(#dhGlow)" />
          <circle cx="100" cy="100" r="73" fill="url(#dhHexPattern)" opacity="0.5" />

          {/* 外圈装饰 */}
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(0,229,255,0.08)" strokeWidth="0.5" strokeDasharray="2 4" />

          {/* 侧边科技指示线 */}
          <line x1="30" y1="100" x2="22" y2="100" stroke="rgba(0,229,255,0.2)" strokeWidth="1" strokeLinecap="round" />
          <line x1="170" y1="100" x2="178" y2="100" stroke="rgba(0,229,255,0.2)" strokeWidth="1" strokeLinecap="round" />

          {/* 左眉 */}
          <line className="dh-brow dh-brow--l" x1="70" y1="80" x2="90" y2="80" stroke="url(#dhHeadGrad)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

          {/* 右眉 */}
          <line className="dh-brow dh-brow--r" x1="110" y1="80" x2="130" y2="80" stroke="url(#dhHeadGrad)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

          {/* 左眼 */}
          <g className="dh-eye dh-eye--l">
            <ellipse cx="80" cy="92" rx="15" ry="6" fill="#00e5ff" opacity="0.12" />
            <ellipse className="dh-eye__pupil" cx="80" cy="92" rx="11" ry="3.5" fill="#00e5ff" />
          </g>

          {/* 右眼 */}
          <g className="dh-eye dh-eye--r">
            <ellipse cx="120" cy="92" rx="15" ry="6" fill="#00e5ff" opacity="0.12" />
            <ellipse className="dh-eye__pupil" cx="120" cy="92" rx="11" ry="3.5" fill="#00e5ff" />
          </g>

          {/* 嘴巴：不同表情用不同 path，通过 CSS 切换显示（兼容性更好，不用 CSS d:path()） */}
          <g className="dh-mouth">
            {/* calm 平静微笑 */}
            <path className="dh-mouth__path dh-mouth__path--calm"
              d="M 85 122 Q 100 128 115 122"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            {/* alert 警示：嘴微张 */}
            <path className="dh-mouth__path dh-mouth__path--alert"
              d="M 90 122 Q 100 126 110 122"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2.5" strokeLinecap="round" />
            {/* happy 开心：大笑 */}
            <path className="dh-mouth__path dh-mouth__path--happy"
              d="M 80 118 Q 100 134 120 118"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2.5" strokeLinecap="round" />
            {/* thinking 思考：微下弯 */}
            <path className="dh-mouth__path dh-mouth__path--thinking"
              d="M 88 124 Q 100 120 112 124"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            {/* focus 专注：平直 */}
            <path className="dh-mouth__path dh-mouth__path--focus"
              d="M 90 123 L 110 123"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            {/* approve 赞许：微笑 */}
            <path className="dh-mouth__path dh-mouth__path--approve"
              d="M 86 121 Q 100 130 114 121"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            {/* surprised 惊讶：小圆嘴 */}
            <ellipse className="dh-mouth__path dh-mouth__path--surprised"
              cx="100" cy="123" rx="5" ry="6"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" />
            {/* worried 担忧：下弯 */}
            <path className="dh-mouth__path dh-mouth__path--worried"
              d="M 86 127 Q 100 120 114 127"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            {/* 说话时嘴部开合 */}
            <ellipse className="dh-mouth-open" cx="100" cy="122" rx="8" ry="3" fill="#9c4f43" opacity="0" />
          </g>
        </svg>
      </div>

      {/* 字幕 */}
      <div className={`dh-caption${caption ? ' dh-caption--on' : ''}`}>
        <span className="dh-caption__dot" />
        <span className="dh-caption__text">{caption}</span>
        <button
          type="button"
          className={`dh-mute-btn${muted ? ' muted' : ''}`}
          onClick={toggleMuted}
          title={muted ? '已静音，点击开启声音' : '点击静音'}
          aria-label={muted ? '取消静音' : '静音'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* 未解锁声音时提示用户 */}
      {emerged && !unlocked && (
        <div className="dh-unlock-hint">点击页面任意位置，开启数字人声音</div>
      )}
    </div>
  )
}
