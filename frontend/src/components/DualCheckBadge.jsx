export default function DualCheckBadge({ passed = true, summary = '' }) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderColor: passed ? 'var(--green)' : 'var(--yellow)',
        background: passed ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          color: '#fff',
          background: passed ? 'var(--green)' : 'var(--yellow)',
          flexShrink: 0,
        }}
      >
        {passed ? '✓' : '!'}
      </span>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 14 }}>{passed ? 'AI 自检通过' : 'AI 自检未通过'}</strong>
        {summary && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{summary}</p>}
      </div>
    </div>
  )
}
