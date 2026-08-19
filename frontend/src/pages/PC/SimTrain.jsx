import { useNavigate } from 'react-router-dom'
import SceneSelector from '../../components/SceneSelector'
import RiskTag from '../../components/RiskTag'
import SimTrainCard from '../../components/SimTrainCard'
import { useSimTrain } from '../../hooks/useSimTrain'

const STAGE_TITLE = { pre: '🎯 预考', sim: '🧩 学习模拟', post: '📝 正式考核' }
const STAGE_DESC = {
  pre: '未接受培训前的基线测试，做完直接进入学习。',
  sim: '可反复练习，错了会告诉你后果和正确做法，不计入正式成绩。',
  post: '培训后的考核，分数≥60 且高于预考=通过培训！',
}
const STAGE_BADGE_LEVEL = { pre: 'medium', sim: 'low', post: 'high' }

export default function SimTrain() {
  const {
    sceneCode, stage, scene, steps, idx, selected, revealed, loading, submitLoading, result, error,
    currentStep, onChoose, nextStep, prevStep, retry, navigate,
  } = useSimTrain()

  if (result) {
    return (
      <div>
        <SceneSelector />
        <div className="card hero-card" style={{ marginTop: 14, padding: 20 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 48 }}>{scene?.icon}</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="muted" style={{ fontSize: 13 }}>{STAGE_TITLE[stage]}</div>
              <h1 style={{ fontSize: 28, margin: '4px 0 0' }}>{scene?.name}</h1>
              <div className="muted" style={{ marginTop: 4 }}>正确 {result.correct_count}/{result.total} · 高危答错 {result.high_risk_wrong} 步</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: result.passed ? 'var(--green)' : 'var(--red)' }}>{result.score}</div>
              <RiskTag level={result.passed ? 'low' : 'high'} style={{ display: 'inline-flex' }}>{result.passed ? '通过' : '未通过'}</RiskTag>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {stage === 'pre' && <button className="btn" onClick={() => navigate(`/sim/${sceneCode}/sim`)}>🧩 开始学习模拟</button>}
          {stage === 'sim' && (<><button className="btn-outline chip-btn" onClick={retry}>🔁 再练一遍</button><button className="btn" onClick={() => navigate(`/sim/${sceneCode}/post`)}>📝 参加考核</button></>)}
          {stage === 'post' && (<><button className="btn-outline chip-btn" onClick={() => navigate(`/sim/${sceneCode}/sim`)}>🔁 继续练习</button></>)}
          <button className="btn-outline chip-btn" onClick={() => navigate('/training')}>🏠 返回培训总览</button>
        </div>
        <h3 className="section-title" style={{ marginTop: 20 }}><span className="dot" />逐步详解</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(result.step_details || []).map((d, i) => {
            const s = steps[i]
            return (
              <div key={i} className={`card ${d.correct ? '' : 'alert-error'}`} style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span className={`step-badge ${d.correct ? '' : 'error'}`} style={{ background: d.correct ? 'var(--green-bg)' : 'var(--red-bg)', color: d.correct ? 'var(--green)' : 'var(--red)' }}>{d.correct ? '✓' : '✗'} {i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{d.step_title}</div>
                    <div className="muted" style={{ marginTop: 2 }}>你的选择：{d.choice_label || '未作答'}</div>
                    {!d.correct && d.consequence && <div className="alert alert-error" style={{ marginTop: 8 }}>错误后果：{d.consequence}</div>}
                    {d.explanation && <div className="alert alert-info" style={{ marginTop: 6 }}>{d.correct ? '💡 ' : '✅ 正确做法：'}{d.explanation}</div>}
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

  return (
    <div>
      <SceneSelector />
      <div style={{ marginTop: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 32 }}>{scene?.icon}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <RiskTag level={STAGE_BADGE_LEVEL[stage] || 'medium'}>{STAGE_TITLE[stage]}</RiskTag>
                <strong style={{ fontSize: 18 }}>{scene?.name}</strong>
              </div>
              <div className="muted" style={{ marginTop: 4 }}>{STAGE_DESC[stage]}</div>
            </div>
            <div className="badge" style={{ fontSize: 14 }}>{steps.length > 0 ? `${idx + 1} / ${steps.length}` : '加载步骤中…'}</div>
          </div>
          <div className="progress" style={{ marginTop: 12 }}>
            <span style={{ width: steps.length ? `${((idx + (revealed ? 1 : 0)) / steps.length) * 100}%` : '0%' }} />
          </div>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        {loading && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="skeleton" style={{ height: 80, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 40 }} />
          </div>
        )}

        {!loading && currentStep && (
          <SimTrainCard
            step={currentStep}
            idx={idx}
            selected={selected}
            revealed={revealed}
            stage={stage}
            onChoose={onChoose}
          />
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 12 }}>
          <button className="btn-outline chip-btn" onClick={prevStep} disabled={idx === 0}>← 上一步</button>
          <div style={{ flex: 1 }} />
          <button className="btn" disabled={!revealed} onClick={nextStep}>
            {idx < (steps.length - 1) ? '下一步 →' : (submitLoading ? '提交中…' : '提交结果')}
          </button>
        </div>
      </div>
    </div>
  )
}
