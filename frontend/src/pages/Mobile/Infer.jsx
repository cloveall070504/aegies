import { useState } from 'react'
import { inferScenario } from '../../api/scenario'
import ScoreGauge from '../../components/ScoreGauge'
import RiskTag from '../../components/RiskTag'
import DualCheckBadge from '../../components/DualCheckBadge'

export default function MobileInfer() {
  const [step, setStep] = useState(1) // 1 输入 -> 2 结果
  const [behavior, setBehavior] = useState('')
  const [sceneType, setSceneType] = useState('experiment')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const submit = async () => {
    if (!behavior.trim()) {
      setError('请输入操作行为描述')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await inferScenario(behavior.trim(), sceneType)
      setResult(data)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (step === 2 && result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>推演结果</h2>
          <button className="btn-outline" onClick={() => setStep(1)}>返回重试</button>
        </div>
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <ScoreGauge score={result.risk_score} size={110} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong>风险等级</strong>
              <RiskTag level={result.level} />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{result.behavior}</div>
          </div>
        </div>
        <DualCheckBadge passed={result.ai_checked === 1} summary={result.critic_summary} />
        <div className="card">
          <strong style={{ fontSize: 14 }}>后果与整改</strong>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{result.consequence}</p>
        </div>
        <div className="card">
          <strong style={{ fontSize: 14 }}>纠错步骤</strong>
          <ol style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 0', paddingLeft: 18 }}>
            {String(result.correction || '').split('\n').filter(Boolean).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        {(result.source_refs || []).length > 0 && (
          <div className="card">
            <strong style={{ fontSize: 14 }}>条款依据</strong>
            {result.source_refs.slice(0, 3).map((ref) => (
              <div key={ref.id} className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                · {ref.clause_ref}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>AI场景推演</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 6 }}>场景类型</label>
          <select className="select" value={sceneType} onChange={(e) => setSceneType(e.target.value)}>
            <option value="experiment">学生实验模式</option>
            <option value="worker">工人车间模式</option>
          </select>
        </div>
        <div>
          <label className="muted" style={{ display: 'block', marginBottom: 6 }}>操作行为</label>
          <textarea
            className="textarea"
            placeholder="例如：加热试管时试管口朝向人"
            value={behavior}
            onChange={(e) => setBehavior(e.target.value)}
          />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button className="btn" onClick={submit} disabled={loading}>{loading ? '推演中…' : '开始推演'}</button>
      </div>
    </div>
  )
}
