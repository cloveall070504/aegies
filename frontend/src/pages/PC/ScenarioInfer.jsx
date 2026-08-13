import { useState } from 'react'
import { inferScenario } from '../../api/scenario'
import ScoreGauge from '../../components/ScoreGauge'
import RiskTag from '../../components/RiskTag'
import DualCheckBadge from '../../components/DualCheckBadge'

const SCENE_TYPES = [
  { value: 'experiment', label: '学生实验模式' },
  { value: 'worker', label: '工人车间模式' },
]

export default function ScenarioInfer() {
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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">AI错误场景模拟推演</h1>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 5fr) minmax(360px, 7fr)', alignItems: 'start' }}>
        {/* 输入区 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 6 }}>场景类型</label>
            <select className="select" value={sceneType} onChange={(e) => setSceneType(e.target.value)}>
              {SCENE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 6 }}>操作行为描述</label>
            <textarea
              className="textarea"
              placeholder="例如：加热试管时试管口朝向人；带电接线；未佩戴护目镜操作腐蚀性试剂…"
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
            />
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <button className="btn" onClick={submit} disabled={loading}>
            {loading ? '推演中…' : '开始推演'}
          </button>
          <div className="muted">提示：未连接 Ollama 时自动使用内置规则引擎与条款溯源库，离线可用。</div>
        </div>

        {/* 结果展示区 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!result && (
            <div className="card muted" style={{ textAlign: 'center', padding: 48 }}>
              输入操作行为后点击「开始推演」，系统将展示风险分、双AI自检结果与条款溯源。
            </div>
          )}
          {result && (
            <>
              <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <ScoreGauge score={result.risk_score} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <strong style={{ fontSize: 18 }}>风险等级</strong>
                    <RiskTag level={result.level} />
                  </div>
                  <p className="muted" style={{ margin: '4px 0' }}>行为：{result.behavior}</p>
                  <p className="muted" style={{ margin: '4px 0' }}>引擎：{result.engine === 'ollama' ? 'Ollama 双智能体' : '内置规则引擎'}</p>
                </div>
              </div>

              <DualCheckBadge passed={result.ai_checked === 1} summary={result.critic_summary} />

              <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>推演后果</h3>
                <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{result.consequence}</p>
              </div>

              <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>纠错步骤</h3>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                  {String(result.correction || '').split('\n').filter(Boolean).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>条款溯源（{result.source_refs?.length || 0}）</h3>
                {(result.source_refs || []).map((ref) => (
                  <div key={ref.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <RiskTag level={ref.level} />
                      <span className="muted">权重 {ref.weight}</span>
                    </div>
                    <div style={{ fontSize: 14 }}>{ref.description}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>依据：{ref.clause_ref}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
