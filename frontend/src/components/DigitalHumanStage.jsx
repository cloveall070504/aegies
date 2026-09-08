import { useEffect, useRef, useState } from 'react'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { setVoiceUnlocked } from '../utils/speechController'

/**
 * 数字人中心舞台（屏幕 C 位）· 科技蜂窝脸版
 *
 * 设计：
 *  1. 圆形脸 + 蜂窝纹理 + 椭圆眼 + 线条眉 + 简洁嘴
 *  2. 自动眨眼（CSS transform: scaleY）
 *  3. 不说话时嘴不动；说话时嘴部开合由 store.speaking 驱动
 *  4. 表情系统：neutral / happy / thinking / surprised ...（CSS [data-expression] 规则）
 *  5. 语音由 speechController 统一单路播放（避免与 FloatingCompanion 唱双簧）
 *
 * 说明：早期曾有一套 rAF 补间（applyExpr），但元素选择器写错导致全程 early-return 成死代码，
 * 已删除，避免答辩时误称"自研补间动画"。
 */

export default function DigitalHumanStage({ emerged = false }) {
  const { caption, speaking, expression, muted, toggleMuted } = useDigitalHumanStore()
  const [unlocked, setUnlocked] = useState(false)
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

  // 用户首次点击/按键，解锁浏览器自动播放限制（同时通知 speechController）
  useEffect(() => {
    const unlock = () => {
      setUnlocked(true)
      setVoiceUnlocked(true)
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

          {/* 嘴巴：不同表情用不同 path，通过 CSS 切换显示 */}
          <g className="dh-mouth">
            <path className="dh-mouth__path dh-mouth__path--calm"
              d="M 85 122 Q 100 128 115 122"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            <path className="dh-mouth__path dh-mouth__path--alert"
              d="M 90 122 Q 100 126 110 122"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2.5" strokeLinecap="round" />
            <path className="dh-mouth__path dh-mouth__path--happy"
              d="M 80 118 Q 100 134 120 118"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2.5" strokeLinecap="round" />
            <path className="dh-mouth__path dh-mouth__path--thinking"
              d="M 88 124 Q 100 120 112 124"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            <path className="dh-mouth__path dh-mouth__path--focus"
              d="M 90 123 L 110 123"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            <path className="dh-mouth__path dh-mouth__path--approve"
              d="M 86 121 Q 100 130 114 121"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
            <ellipse className="dh-mouth__path dh-mouth__path--surprised"
              cx="100" cy="123" rx="5" ry="6"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" />
            <path className="dh-mouth__path dh-mouth__path--worried"
              d="M 86 127 Q 100 120 114 127"
              fill="none" stroke="url(#dhHeadGrad)" strokeWidth="2" strokeLinecap="round" />
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
