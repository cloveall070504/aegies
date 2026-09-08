// 轻量级遥测：在前端累计 TTS / ASR / LLM 三类通道的成功/失败次数与耗时，
// 每 20s 把本地快照上报到后端 /api/v1/telemetry/snapshot，
// 运维或答辩演示可通过 GET /api/v1/telemetry/stats 实时查看成功率。
import client from '../api/client'

const stats = {
  tts: { ok: 0, fail: 0, total_ms: 0 },
  asr: { ok: 0, fail: 0, total_ms: 0 },
  llm: { ok: 0, fail: 0, total_ms: 0 },
}

function bump(channel, ok, ms) {
  const b = stats[channel]
  if (!b) return
  if (ok) b.ok += 1
  else b.fail += 1
  b.total_ms += Math.max(0, Math.round(ms || 0))
}

export function trackTTS(ok, ms) { bump('tts', ok, ms) }
export function trackASR(ok, ms) { bump('asr', ok, ms) }
export function trackLLM(ok, ms) { bump('llm', ok, ms) }

export function getTelemetry() {
  return JSON.parse(JSON.stringify(stats))
}

let flushTimer = null
function flush() {
  try {
    // 上报后不清零：本地快照持续累计，后端再做累加，避免丢点
    client.post('/telemetry/snapshot', { channels: getTelemetry() })
  } catch (_) {
    // 上报失败静默跳过，下次周期重试
  }
}

export function startTelemetryFlush() {
  if (flushTimer) return
  flushTimer = setInterval(flush, 20000)
}

// 模块加载即启动周期上报
startTelemetryFlush()
