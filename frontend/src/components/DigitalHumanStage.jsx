import { useEffect, useRef, useState } from 'react'
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

// 表情系统说明：神态切换完全由 CSS 负责（见 nexus.css 的 [data-expression=...] 规则），
// 8 种表情 + 0.4s 缓动过渡，无需 JS 逐帧补间。早期曾有一套 rAF 补间（applyExpr），
// 但元素选择器写错（取 #left-eye 等不存在的 id）导致全程 early-return 成死代码，已删除，
// 避免答辩时误称"自研补间动画"。

export default function DigitalHumanStage({ emerged = false }) {
  const { caption, speaking, expression, muted, toggleMuted, hush } = useDigitalHumanStore()
  const [unlocked, setUnlocked] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const svgRef = useRef(null)
  const blinkTimerRef = useRef(null)

  // 自动眨眼
  useEffect(() => {
    const blink = () => {
      const svg = svgRef.current
      if (!svg) return
      const eyes = svg.querySelectorAll('.dh-eye')
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
              <polygon points="7,0 14,3.54 14,8.58 7,12.12 0,8.58 0,3.54" fill="none" stroke="rgba(0,229,255,0.28)" strokeWidth="0.7" />
            </pattern>
          </defs>

          {/* 圆形脸部 */}
          <circle cx="100" cy="100" r="75" fill="url(#dhFaceGrad)" stroke="url(#dhHeadGrad)" strokeWidth="2" filter="url(#dhGlow)" />
          <circle cx="100" cy="100" r="73" fill="url(#dhHexPattern)" opacity="0.85" />

          {/* 外圈装饰 */}
          <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(0,229,255,0.22)" strokeWidth="0.7" strokeDasharray="2 4" />

          {/* 侧边科技指示线 */}
          <line x1="30" y1="100" x2="22" y2="100" stroke="rgba(0,229,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="170" y1="100" x2="178" y2="100" stroke="rgba(0,229,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />

          {/* 左眉 */}
          <line className="dh-brow dh-brow--l" x1="70" y1="80" x2="90" y2="80" stroke="url(#dhHeadGrad)" strokeWidth="3" strokeLinecap="round" opacity="1" />

          {/* 右眉 */}
          <line className="dh-brow dh-brow--r" x1="110" y1="80" x2="130" y2="80" stroke="url(#dhHeadGrad)" strokeWidth="3" strokeLinecap="round" opacity="1" />

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
