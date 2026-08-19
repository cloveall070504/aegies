const LEVEL_MAP = {
  high: { label: '高危', cls: 'tag-high' },
  medium: { label: '中危', cls: 'tag-medium' },
  low: { label: '低危', cls: 'tag-low' },
  none: { label: '未识别', cls: 'tag-safe' },
}

export default function RiskTag({ level, children }) {
  const cfg = LEVEL_MAP[level] || LEVEL_MAP.low
  return (
    <span className={`tag ${cfg.cls}`}>
      {children || cfg.label}
    </span>
  )
}
