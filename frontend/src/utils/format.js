export function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export function clampScore(n) {
  return Math.max(0, Math.min(100, Number(n) || 0))
}
