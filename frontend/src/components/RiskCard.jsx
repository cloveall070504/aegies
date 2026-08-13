import RiskTag from './RiskTag'

export default function RiskCard({ item, onClick }) {
  if (!item) return null
  const { description, level = 'low', clause_ref = '', count } = item
  return (
    <div
      className="card risk-card"
      style={{ borderLeft: `4px solid var(--${level === 'high' ? 'red' : level === 'medium' ? 'yellow' : 'green'})`, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <RiskTag level={level} />
        {count !== undefined && <span className="muted">{count} 次</span>}
      </div>
      <p style={{ margin: '8px 0', fontSize: 14, lineHeight: 1.5 }}>{description}</p>
      {clause_ref && <p className="muted" style={{ margin: 0, fontSize: 12 }}>条款：{clause_ref}</p>}
    </div>
  )
}
