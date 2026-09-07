import { useEffect, useRef, useState } from 'react'

/**
 * 进场过渡：全屏黑场 → 蜂窝涟漪从中心扩散 → 数字人脸浮现 → 黑场淡出
 *
 * 时序（ms）：
 *   0            纯黑场，什么都没有
 *   400          蜂窝涟漪开始从中心扩散
 *   1500         onEmerge：数字人脸开始在涟漪中心浮现
 *   2900         onDone：过渡主体结束，右侧功能逐个浮现
 *   2900 + 800   黑场淡出并卸载
 */

const EMERGE_AT = 1500
const DONE_AT = 2900
const FADE_MS = 800
const RIPPLE_START = 400

const HEX_SIZE = 22
const HEX_W = Math.sqrt(3) * HEX_SIZE
const HEX_H = 2 * HEX_SIZE
const ROW_SP = HEX_H * 0.75
const COL_SP = HEX_W

const BG_COLORS = [
  { r: 0, g: 229, b: 255 },
  { r: 168, g: 85, b: 247 },
  { r: 236, g: 72, b: 153 },
]

function drawHex(ctx, x, y, size, colorStr, fillOp, strokeOp, lw) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2
    const px = x + Math.cos(a) * size
    const py = y + Math.sin(a) * size
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  if (fillOp > 0.001) {
    ctx.fillStyle = `rgba(${colorStr},${fillOp})`
    ctx.fill()
  }
  ctx.strokeStyle = `rgba(${colorStr},${strokeOp})`
  ctx.lineWidth = lw
  ctx.stroke()
}

export default function RippleTransition({ onEmerge, onDone }) {
  const canvasRef = useRef(null)
  const [phase, setPhase] = useState('run')

  useEffect(() => {
    const t1 = setTimeout(() => onEmerge?.(), EMERGE_AT)
    const t2 = setTimeout(() => {
      setPhase('fade')
      onDone?.()
    }, DONE_AT)
    const t3 = setTimeout(() => setPhase('gone'), DONE_AT + FADE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onEmerge, onDone])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let raf = 0
    let startedAt = 0
    let waveTimer = 0
    let waveIdx = 0
    const waves = []
    let cells = []

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const buildGrid = () => {
      cells = []
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const cols = Math.ceil(w / COL_SP) + 2
      const rows = Math.ceil(h / ROW_SP) + 2
      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          const xOff = (r & 1) * (HEX_W / 2)
          cells.push({
            x: c * COL_SP + xOff,
            y: r * ROW_SP,
            baseOp: 0.02 + Math.random() * 0.04,
            brightness: 0,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpd: 0.008 + Math.random() * 0.015,
          })
        }
      }
    }

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      buildGrid()
    }
    resize()
    window.addEventListener('resize', resize)

    const spawnWave = () => {
      waves.push({
        radius: 60,
        speed: 2.5 + Math.random() * 0.8,
        band: 50,
        color: BG_COLORS[waveIdx % 3],
      })
      waveIdx++
    }

    // 涟漪圆心对齐数字人舞台中心（人脸所在），而非视口正中
    const getCenter = () => {
      const w0 = canvas.clientWidth
      const h0 = canvas.clientHeight
      const stage = document.querySelector('.nexus__stage')
      if (!stage) return { cx: w0 / 2, cy: h0 / 2 }
      const rect = stage.getBoundingClientRect()
      return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 }
    }

    const draw = (now) => {
      if (!startedAt) startedAt = now
      const t = now - startedAt
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const { cx, cy } = getCenter()

      ctx.clearRect(0, 0, w, h)

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)

      if (t < RIPPLE_START) {
        raf = requestAnimationFrame(draw)
        return
      }

      const maxDist = Math.sqrt(
        Math.max(cx, w - cx) ** 2 + Math.max(cy, h - cy) ** 2
      ) + 100

      const intensity = Math.min((t - RIPPLE_START) / 800, 1)

      const centerGlowR = Math.min(t / 8, 200) * intensity
      if (centerGlowR > 0) {
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, centerGlowR)
        gr.addColorStop(0, `rgba(0,229,255,${0.15 * intensity})`)
        gr.addColorStop(0.5, `rgba(168,85,247,${0.06 * intensity})`)
        gr.addColorStop(1, 'rgba(0,229,255,0)')
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.arc(cx, cy, centerGlowR, 0, Math.PI * 2)
        ctx.fill()
      }

      waveTimer++
      if (waveTimer >= 25 && t < DONE_AT - 200) {
        waveTimer = 0
        spawnWave()
      }

      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].radius += waves[i].speed
        if (waves[i].radius > maxDist) waves.splice(i, 1)
      }

      for (const cell of cells) {
        const dx = cell.x - cx
        const dy = cell.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)

        cell.twinkle += cell.twinkleSpd
        const ambient = (Math.sin(cell.twinkle) * 0.5 + 0.5) * 0.01
        const centerGlow = Math.max(0, 1 - dist / 200) * 0.20 * intensity

        let wb = 0
        let wc = '0,229,255'
        for (const wave of waves) {
          const diff = Math.abs(dist - wave.radius)
          if (diff < wave.band) {
            const f = 1 - diff / wave.band
            const b = f * f
            if (b > wb) {
              wb = b
              wc = wave.color.r + ',' + wave.color.g + ',' + wave.color.b
            }
          }
        }
        cell.brightness = cell.brightness * 0.85 + wb * 0.15

        // 黑底上场波纹可以更明显：静态网格 13-16%，波纹叠加
        const restStroke = (0.13 + cell.baseOp + ambient * 0.5) * intensity
        const glowStroke = cell.brightness * 0.6
        const strokeOp = Math.min(0.95, restStroke + glowStroke + centerGlow * 0.6)
        const fillOp = Math.min(0.42, cell.brightness * 0.30 + centerGlow * 0.25)
        const color = cell.brightness > 0.03 ? wc : '0,229,255'
        const lw = cell.brightness > 0.03 ? 1.1 : 0.7

        drawHex(ctx, cell.x, cell.y, HEX_SIZE, color, fillOp, strokeOp, lw)
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div
      className={`ripple-veil${phase === 'fade' ? ' ripple-veil--fade' : ''}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="ripple-canvas" />
    </div>
  )
}
