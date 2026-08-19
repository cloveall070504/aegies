import RiskTag from './RiskTag'

export default function RiskCard({ item, onClick }) {
  if (!item) return null
  const { description, behavior, level = 'low', clause_ref = '', count } = item
  const text = description || behavior || '—'
  return (
    <div
      className="card risk-card"
      data-level={level}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="risk-card-head">
        <RiskTag level={level} />
        {count !== undefined && <span className="muted">{count} 次</span>}
      </div>
      <p className="risk-card-desc">{text}</p>
      {clause_ref && <p className="muted risk-card-clause">条款：{clause_ref}</p>}
    </div>
  )
}
