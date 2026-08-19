import { clampScore } from '../utils/format'

export default function ScoreGauge({ score, size = 140 }) {
  const value = clampScore(score)
  const color = value >= 70 ? 'var(--red)' : value >= 40 ? 'var(--yellow)' : 'var(--green)'
  const r = (size - 16) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: 'drop-shadow(0 6px 14px rgba(79,70,229,0.18))' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={9} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size / 4.4}
          fontWeight={800}
          fill={color}
        >
          {value}
        </text>
      </svg>
      <span className="muted" style={{ fontSize: 12 }}>风险分</span>
    </div>
  )
}
