import ScoreGauge from '../../components/ScoreGauge'
import RiskTag from '../../components/RiskTag'
import DualCheckBadge from '../../components/DualCheckBadge'
import { useInfer } from '../../hooks/useInfer'

const EXAMPLES_BY_SCENE = {
  chem_lab: ['加热试管时试管口朝向人', '未佩戴护目镜操作腐蚀性试剂', '稀释浓硫酸时将水倒入酸中', '酸性废液倒入下水道'],
}

export default function MobileInfer() {
  const { currentScene, sceneCode, behavior, setBehavior, loading, error, result, submit } = useInfer()
  const examples = EXAMPLES_BY_SCENE[sceneCode] || EXAMPLES_BY_SCENE.chem_lab

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>推演结果</h2>
          <button className="btn-outline chip-btn" onClick={() => { setBehavior(''); }}>返回重试</button>
        </div>
        <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <ScoreGauge score={result.risk_score} size={110} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <strong>风险等级</strong>
              <RiskTag level={result.level} />
            </div>
            <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.behavior}</div>
            <span className="badge" style={{ marginTop: 6 }}>
              {result.trust_mode === 'llm_enhanced' ? '🤖 Ollama 增强' : '⚙️ 规则引擎·确定性'}
            </span>
            <div style={{ marginTop: 6 }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 3 }}>判定置信度 {Math.round((result.confidence || 0) * 100)}%</div>
              <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round((result.confidence || 0) * 100)}%`,
                    height: '100%',
                    background: (result.confidence || 0) >= 0.6 ? 'var(--green)' : (result.confidence || 0) >= 0.35 ? 'var(--yellow)' : 'var(--red)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <DualCheckBadge passed={result.ai_checked === 1} verifiedBy={result.verified_by} divergence={result.critic_divergence} summary={result.critic_summary} />
        <div className="card">
          <h3 className="section-title"><span className="dot" />判定依据</h3>
          {result.critic_divergence && (
            <div className="alert" style={{ fontSize: 11, marginBottom: 8, borderColor: 'var(--yellow)', background: 'rgba(245,158,11,0.10)', color: 'var(--yellow)' }}>
              ⚠️ 模型复核与规则引擎分歧，已以规则引擎为准
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            <span className="badge">领域输入：{result.evidence?.domain_input ? '是' : '否'}</span>
            <span className="badge">语义等级：{result.evidence?.semantic_level || 'low'}</span>
            <span className="badge">信号：{result.evidence?.signal_count ?? 0} 条</span>
          </div>
          {(() => {
            const kh = result.evidence?.keyword_hits || {}
            const anyKw = (kh.high || []).length + (kh.medium || []).length + (kh.low || []).length
            if (anyKw === 0) return null
            return (
              <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {(kh.high || []).map((k) => <span key={'h' + k} className="badge" style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: 11 }}>高危·{k}</span>)}
                {(kh.medium || []).map((k) => <span key={'m' + k} className="badge" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)', fontSize: 11 }}>中危·{k}</span>)}
                {(kh.low || []).map((k) => <span key={'l' + k} className="badge" style={{ fontSize: 11 }}>{k}</span>)}
              </div>
            )
          })()}
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />后果与整改</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{result.consequence}</p>
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />纠错步骤</h3>
          <ol style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
            {String(result.correction || '').split('\n').filter(Boolean).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        {(result.source_refs || []).length > 0 && (
          <div className="card">
            <h3 className="section-title"><span className="dot" />条款依据</h3>
            {result.source_refs.slice(0, 3).map((ref) => (
              <div key={ref.id} className="info-row" style={{ fontSize: 12 }}>
                <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.clause_ref}</span>
                <RiskTag level={ref.level} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>🧪 场景推演 · {currentScene?.icon} {currentScene?.name}</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="badge" style={{ fontSize: 13 }}>
            {currentScene?.icon} {currentScene?.name} · 实验场景
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            切换场景请用顶部场景选择器
          </div>
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {examples.map((ex) => (
            <button key={ex} className="btn-outline chip-btn" onClick={() => setBehavior(ex)}>{ex}</button>
          ))}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn" onClick={submit} disabled={loading}>
          {loading ? <><span className="spinner" /> 推演中…</> : '🚀 开始推演'}
        </button>
      </div>
    </div>
  )
}
