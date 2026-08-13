const LEVEL_MAP = {
  high: { label: '高危', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  medium: { label: '中危', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low: { label: '低危', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
}

export default function RiskTag({ level }) {
  const cfg = LEVEL_MAP[level] || LEVEL_MAP.low
  return (
    <span className="tag" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}
