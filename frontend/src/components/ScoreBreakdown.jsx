/** 评分明细组件（A3 透明化）：展示规则引擎逐项加分的过程，让学生/教师看到"为什么是这个分"。 */
export default function ScoreBreakdown({ items, score }) {
  if (!items || items.length === 0) return null
  const total = typeof score === 'number'
    ? score
    : Math.round(items.reduce((s, it) => s + (Number(it.delta) || 0), 0) * 10) / 10
  return (
    <div className="card" style={{ marginTop: 14, boxShadow: 'none', background: 'var(--card-2)' }}>
      <h3 className="section-title"><span className="dot" />评分明细（规则引擎逐项累加）</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        每一项都是一个加分信号，过程透明、可追溯，不依赖模型黑箱。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it, i) => {
          const delta = Number(it.delta ?? 0)
          return (
            <div key={i} className="info-row" style={{ gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                <strong>{it.factor}</strong>
                {it.detail ? <span className="muted" style={{ fontSize: 12 }}> · {it.detail}</span> : null}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: 'var(--yellow-2)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 52,
                  textAlign: 'right',
                  flex: 'none',
                }}
              >
                +{delta.toFixed(1)}
              </span>
            </div>
          )
        })}
        <div
          className="info-row"
          style={{
            gap: 10,
            borderTop: '1px dashed var(--border)',
            marginTop: 4,
            paddingTop: 8,
            fontWeight: 800,
          }}
        >
          <span style={{ flex: 1 }}>风险分合计</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--red)', minWidth: 52, textAlign: 'right', flex: 'none' }}>
            {total}
          </span>
        </div>
      </div>
    </div>
  )
}
