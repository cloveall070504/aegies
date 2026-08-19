/**
 * Mobile 分步骤模拟页 /mobile/sim/:sceneCode/:stage
 * 复用共享 hook useSimTrain（与 PC/SimTrain 同一套状态与判分逻辑，消除双端行为漂移）。
 * 仅保留 Mobile 专属的卡片样式与跳转交互。
 */
import { useNavigate } from 'react-router-dom'
import RiskTag from '../../components/RiskTag'
import { useSimTrain } from '../../hooks/useSimTrain'

const STAGE_TITLE = {
  pre: '🎯 预考',
  sim: '🧩 学习模拟',
  post: '📝 正式考核',
}
const STAGE_DESC = {
  pre: '未接受培训前的基线测试',
  sim: '这里可以反复练习，错了会告诉你后果和正确做法',
  post: '培训后的考核，分数≥60 且高于预考=通过',
}
const STAGE_BADGE_LEVEL = { pre: 'medium', sim: 'low', post: 'high' }

export default function MobileSimTrain() {
  const navigate = useNavigate()
  const {
    sceneCode, stage, scene, steps, idx, selected, revealed, loading, submitLoading,
    result, error, currentStep, onChoose, nextStep, prevStep, retry,
  } = useSimTrain()

  // ======= 结果视图 =======
  if (result) {
    return (
      <div>
        <div className="card" style={{ padding: 12, marginTop: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 36 }}>{scene?.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <RiskTag level={STAGE_BADGE_LEVEL[stage] || 'medium'}>{STAGE_TITLE[stage]}</RiskTag>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>{scene?.name}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: result.passed ? 'var(--green)' : 'var(--red)' }}>{result.score}</div>
              <RiskTag level={result.passed ? 'low' : 'high'}>{result.passed ? '通过' : '未通过'}</RiskTag>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            正确 {result.correct_count}/{result.total} · 高危答错 {result.high_risk_wrong} 步
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {stage === 'pre' && (
            <button className="btn chip-btn" style={{ flex: 1 }} onClick={() => navigate(`/mobile/sim/${sceneCode}/sim`)}>🧩 学习</button>
          )}
          {stage === 'sim' && (
            <>
              <button className="btn-outline chip-btn" onClick={retry}>🔁 再练</button>
              <button className="btn chip-btn" style={{ flex: 1 }} onClick={() => navigate(`/mobile/sim/${sceneCode}/post`)}>📝 考核</button>
            </>
          )}
          {stage === 'post' && (
            <>
              <button className="btn chip-btn" style={{ flex: 1 }} onClick={() => navigate(`/mobile/training/${sceneCode}`)}>📊 报告</button>
              <button className="btn-outline chip-btn" onClick={() => navigate(`/mobile/sim/${sceneCode}/sim`)}>🔁 练习</button>
            </>
          )}
        </div>

        <h3 className="section-title" style={{ marginTop: 14 }}><span className="dot" />逐步详解</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(result.step_details || []).map((d, i) => {
            const s = steps[i]
            return (
              <div key={i} className={`card ${d.correct ? '' : 'alert-error'}`} style={{ padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className={`step-badge ${d.correct ? '' : 'error'}`} style={{ background: d.correct ? 'var(--green-bg)' : 'var(--red-bg)', color: d.correct ? 'var(--green)' : 'var(--red)' }}>
                    {d.correct ? '✓' : '✗'}{i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{d.step_title}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      你选：{d.choice_label || '未作答'}
                    </div>
                    {!d.correct && d.consequence && (
                      <div className="alert alert-error" style={{ marginTop: 6, padding: 8, fontSize: 12 }}>
                        ⚠ {d.consequence}
                      </div>
                    )}
                    {d.explanation && (
                      <div className="alert alert-info" style={{ marginTop: 6, padding: 8, fontSize: 12 }}>
                        {d.correct ? '💡 ' : '✅ '}{d.explanation}
                      </div>
                    )}
                  </div>
                  {s && <RiskTag level={d.risk_level} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ======= 答题视图 =======
  return (
    <div>
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 24 }}>{scene?.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <RiskTag level={STAGE_BADGE_LEVEL[stage] || 'medium'} style={{ fontSize: 11 }}>{STAGE_TITLE[stage]}</RiskTag>
              <strong style={{ fontSize: 14 }}>{scene?.name}</strong>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{STAGE_DESC[stage]}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {steps.length > 0 ? `${idx + 1}/${steps.length}` : '…'}
          </div>
        </div>
        <div className="progress" style={{ marginTop: 10 }}>
          <span style={{ width: steps.length ? `${((idx + (revealed ? 1 : 0)) / steps.length) * 100}%` : '0%' }} />
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}

      {loading && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="skeleton" style={{ height: 120, marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 40, marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 40 }} />
        </div>
      )}

      {!loading && currentStep && (
        <div className="card" style={{ marginTop: 10, padding: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span className="step-badge">{idx + 1}</span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 15 }}>{currentStep.step_title}</strong>
              <RiskTag level={currentStep.risk_level} style={{ marginLeft: 6 }} />
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
                {currentStep.step_text}
              </div>
              {currentStep.step_hint && stage === 'sim' && (
                <div className="muted" style={{ marginTop: 8, fontSize: 12, padding: 8, borderRadius: 8, background: 'var(--primary-bg)' }}>
                  💡 提示：{currentStep.step_hint}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                {(currentStep.options || []).map((opt, oi) => {
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
                          ? (status === 'correct' ? '1.5px solid var(--green)'
                             : status === 'error' ? '1.5px solid var(--red)'
                             : '1px solid var(--border)')
                          : (isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)'),
                        background: showCorrectness
                          ? (status === 'correct' ? 'rgba(16,185,129,0.08)'
                             : status === 'error' ? 'rgba(239,68,68,0.08)'
                             : 'var(--card-bg)')
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
                const opt = currentStep.options[selected] || {}
                const isCorrect = opt.correct
                return (
                  <div style={{ marginTop: 12 }}>
                    {!isCorrect && opt.consequence && (
                      <div className="alert alert-error" style={{ padding: 8, fontSize: 12 }}>
                        <strong>⚠️ 后果：</strong>{opt.consequence}
                      </div>
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
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12 }}>
        <button className="btn-outline chip-btn" onClick={prevStep} disabled={idx === 0}>← 上一步</button>
        <div style={{ flex: 1 }} />
        <button className="btn" disabled={!revealed} onClick={nextStep}>
          {idx < (steps.length - 1) ? '下一步 →' : (submitLoading ? '提交中…' : '提交结果')}
        </button>
      </div>
    </div>
  )
}
