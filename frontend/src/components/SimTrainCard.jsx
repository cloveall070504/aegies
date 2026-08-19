/**
 * 共享分步骤模拟单步展示卡（PC / Mobile 通用）
 * 展示当前步骤标题、风险等级、文本、提示，以及可点击的选项。
 * 选项点击/揭示/对错着色逻辑与 PC/Mobile 一致，统一在此实现。
 */
import RiskTag from './RiskTag'

export default function SimTrainCard({ step, idx, selected, revealed, stage, onChoose }) {
  if (!step) return null
  return (
    <div className="card" style={{ marginTop: 12, padding: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span className="step-badge">{idx + 1}</span>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 15 }}>{step.step_title}</strong>
          <RiskTag level={step.risk_level} style={{ marginLeft: 6 }} />
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>{step.step_text}</div>
          {step.step_hint && stage === 'sim' && (
            <div className="muted" style={{ marginTop: 8, fontSize: 12, padding: 8, borderRadius: 8, background: 'var(--primary-bg)' }}>
              💡 提示：{step.step_hint}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {(step.options || []).map((opt, oi) => {
              const isCorrect = opt.correct
              const isSelected = selected === oi
              const showCorrectness = revealed
              let status = ''
              if (showCorrectness) {
                if (isSelected && !isCorrect) status = 'error'
                else if (isSelected && isCorrect) status = 'correct'
                else if (isCorrect) status = 'correct'
              }
              return (
                <button
                  key={oi}
                  onClick={() => onChoose(oi)}
                  disabled={revealed}
                  className={`opt-btn ${status}`}
                  style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    borderRadius: 10,
                    border: showCorrectness
                      ? (status === 'correct' ? '1.5px solid var(--green)' : status === 'error' ? '1.5px solid var(--red)' : '1px solid var(--border)')
                      : (isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)'),
                    background: showCorrectness
                      ? (status === 'correct' ? 'var(--green-bg)' : status === 'error' ? 'var(--red-bg)' : 'var(--card-bg)')
                      : (isSelected ? 'var(--primary-bg)' : 'var(--card-bg)'),
                    fontSize: 13,
                    cursor: revealed ? 'default' : 'pointer',
                    color: 'inherit',
                  }}
                >
                  <span style={{ display: 'inline-flex', width: 20, height: 20, justifyContent: 'center', alignItems: 'center', border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '50%', marginRight: 8, fontWeight: 700, fontSize: 11 }}>
                    {String.fromCharCode(65 + oi)}
                  </span>
                  <span style={{ verticalAlign: 'middle' }}>{opt.label}</span>
                </button>
              )
            })}
          </div>

          {revealed && selected >= 0 && (() => {
            const opt = step.options[selected] || {}
            const isCorrect = opt.correct
            return (
              <div style={{ marginTop: 12 }}>
                {!isCorrect && opt.consequence && (
                  <div className="alert alert-error" style={{ padding: 8, fontSize: 12 }}>⚠️ 后果：{opt.consequence}</div>
                )}
                {opt.explanation && (
                  <div className="alert alert-info" style={{ padding: 8, fontSize: 12, marginTop: 6 }}>
                    <strong>{isCorrect ? '💡 ' : '✅ '}</strong>{opt.explanation}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
