const LEVEL_COLOR = {
  high: 'linear-gradient(180deg, #fb7185 0%, #f43f5e 100%)',
  medium: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
  low: 'linear-gradient(180deg, #34d399 0%, #10b981 100%)',
}

const LEVEL_TEXT = {
  high: 'var(--red)',
  medium: 'var(--yellow)',
  low: 'var(--green)',
}

function levelOf(score) {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export default function RiskTrendChart({ data = [], titleSuffix = '推演' }) {
  if (!data.length) return null

  const maxScore = 100
  const gridLines = [100, 75, 50, 25, 0]

  return (
    <div className="risk-trend">
      <div className="risk-trend__header">
        <span className="risk-trend__count">最近 {data.length} 次{titleSuffix}</span>
        <span className="risk-trend__legend">
          <i className="dot" style={{ background: 'var(--red)' }} />高危
          <i className="dot" style={{ background: 'var(--yellow)' }} />中危
          <i className="dot" style={{ background: 'var(--green)' }} />低危
        </span>
      </div>

      <div className="risk-trend__chart">
        {/* Y轴刻度 */}
        <div className="risk-trend__yaxis">
          {gridLines.map((v) => (
            <div key={v} className="risk-trend__ylabel">{v}</div>
          ))}
        </div>

        {/* 图表主体 */}
        <div className="risk-trend__plot">
          {/* 网格线 */}
          <div className="risk-trend__grid">
            {gridLines.map((v) => (
              <div key={v} className="risk-trend__gridline" />
            ))}
          </div>

          {/* 柱条区 */}
          <div className="risk-trend__bars">
            {data.map((t) => {
              const lvl = t.level || levelOf(t.score)
              const h = Math.max(6, Math.min(100, (t.score / maxScore) * 100))
              return (
                <div key={t.idx} className="risk-trend__col" title={`第${t.idx}次${titleSuffix}：风险分 ${t.score}`}>
                  <div className="risk-trend__score-label" style={{ color: LEVEL_TEXT[lvl] || 'var(--text-1)' }}>
                    {t.score}
                  </div>
                  <div className="risk-trend__bar-wrap">
                    <div
                      className="risk-trend__bar"
                      style={{
                        height: `${h}%`,
                        background: LEVEL_COLOR[lvl] || LEVEL_COLOR.high,
                      }}
                    />
                  </div>
                  <div className="risk-trend__xlabel">第{t.idx}次</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="risk-trend__tip">
        柱高=风险分（0~100），越低越安全；颜色区分风险等级
      </div>
    </div>
  )
}
