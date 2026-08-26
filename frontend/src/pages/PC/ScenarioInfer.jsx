import { useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ScoreGauge from '../../components/ScoreGauge'
import RiskTag from '../../components/RiskTag'
import DualCheckBadge from '../../components/DualCheckBadge'
import { useInfer } from '../../hooks/useInfer'

// 按场景 code 提供示例输入（仅化学实验）
const EXAMPLES_BY_SCENE = {
  chem_lab: [
    '加热试管时试管口朝向自己或他人',
    '未佩戴护目镜操作腐蚀性试剂',
    '稀释浓硫酸时将水倒入酸中',
    '实验结束后直接离开未关酒精灯',
    '将酸性废液直接倒入下水道',
    '在易燃溶剂附近使用明火加热',
  ],
}

// 各场景安全提示（仅化学实验）
const SCENE_TIPS = {
  chem_lab: '化学实验重点防护：护目镜、实验服、耐酸碱手套；废液分类收集；易燃溶剂远离明火。',
}

// 根据当前 AI provider 渲染引擎标签/说明（cloud=千问，ollama=本地，rule=规则引擎）
function providerBadge(aiProvider, trustMode) {
  if (trustMode !== 'llm_enhanced') return '⚙️ 规则引擎 · 确定性判定'
  if (aiProvider === 'cloud') return '☁️ 千问云端增强 · 规则校验'
  return '🤖 Ollama 增强 · 规则校验'
}

function providerSubtitle(aiProvider, verifiedBy) {
  if (verifiedBy !== 'rule_engine+llm_critic') {
    return '未启用 AI 模型，风险判定由确定性规则引擎完成（可离线、可复现）'
  }
  if (aiProvider === 'cloud') return '千问云端模型仅增强解释，风险判定以确定性规则引擎为准'
  return '本地模型仅增强解释，风险判定以确定性规则引擎为准'
}

function providerName(aiProvider) {
  if (aiProvider === 'cloud') return '千问模型'
  if (aiProvider === 'ollama') return '本地模型'
  return 'AI 模型'
}

// 高亮文本中命中的条款关键词
function highlightClauses(text, refs) {
  if (!text || !refs || refs.length === 0) return text
  const keywords = new Set()
  refs.forEach((r) => {
    const desc = r.description || ''
    desc.split(/[，,。；;、\s]+/).forEach((w) => {
      if (w.length >= 4 && w.length <= 10) keywords.add(w)
    })
  })
  if (keywords.size === 0) return text
  const sorted = [...keywords].sort((a, b) => b.length - a.length)
  let parts = [text]
  sorted.forEach((kw) => {
    parts = parts.flatMap((p) => {
      if (typeof p !== 'string') return [p]
      const idx = p.indexOf(kw)
      if (idx === -1) return [p]
      return [
        p.slice(0, idx),
        <mark key={kw + idx} className="clause-highlight">{kw}</mark>,
        p.slice(idx + kw.length),
      ]
    })
  })
  return parts
}

export default function ScenarioInfer() {
  const { currentScene, sceneCode, behavior, setBehavior, loading, error, result, submit } = useInfer()
  const [params] = useSearchParams()

  // 从扫描/案例库跳转过来时，URL 携带 ?behavior= 自动预填
  useEffect(() => {
    const b = params.get('behavior')
    if (b) setBehavior(b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const examples = EXAMPLES_BY_SCENE[sceneCode] || EXAMPLES_BY_SCENE.chem_lab
  const tip = SCENE_TIPS[sceneCode] || SCENE_TIPS.chem_lab
  const consequenceParts = useMemo(
    () => (result ? highlightClauses(result.consequence, result.source_refs) : null),
    [result]
  )

  return (
    <div>
      <h1 className="page-title">AI错误场景模拟推演</h1>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 5fr) minmax(360px, 7fr)', alignItems: 'start' }}>
        {/* 输入区 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 6 }}>当前场景</label>
            <div className="badge" style={{ fontSize: 14 }}>
              {currentScene?.icon} {currentScene?.name} · 实验场景
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              切换场景请使用顶部场景选择器，推演将自动按当前场景类型过滤风险知识库
            </div>
          </div>
          <div>
            <label className="muted" style={{ display: 'block', marginBottom: 6 }}>操作行为描述</label>
            <textarea
              className="textarea"
              placeholder="例如：加热试管时试管口朝向人；未佩戴护目镜操作腐蚀性试剂…"
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
            />
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{currentScene?.icon} {currentScene?.name}示例（点击填入）</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {examples.map((ex) => (
                <button key={ex} className="btn-outline chip-btn" onClick={() => setBehavior(ex)} title="点击填入示例">
                  {ex.length > 12 ? ex.slice(0, 12) + '…' : ex}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> 推演中…</> : '🚀 开始推演'}
          </button>
          <div className="muted" style={{ fontSize: 12 }}>💡 未启用 AI 模型时自动使用内置规则引擎与条款溯源库，离线可用。</div>
          <div className="alert" style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary)', fontSize: 12, lineHeight: 1.7 }}>
            <strong>📋 {currentScene?.name}安全提示</strong><br />{tip}
          </div>
        </div>

        {/* 结果展示区 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!result && (
            <div className="card empty">
              <div className="empty-icon">🧪</div>
              <div className="empty-text">输入操作行为后点击「开始推演」</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>系统将展示风险分、双AI自检结果与条款溯源（命中条款高亮）</div>
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
                  <span className="badge">
                    {providerBadge(result.ai_provider, result.trust_mode)}
                  </span>
                  <div style={{ marginTop: 10 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      判定置信度 {Math.round((result.confidence || 0) * 100)}%
                    </div>
                    <div style={{ height: 8, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.round((result.confidence || 0) * 100)}%`,
                          height: '100%',
                          background:
                            (result.confidence || 0) >= 0.6
                              ? 'var(--green)'
                              : (result.confidence || 0) >= 0.35
                                ? 'var(--yellow)'
                                : 'var(--red)',
                        }}
                      />
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {providerSubtitle(result.ai_provider, result.verified_by)}
                    </div>
                  </div>
                </div>
              </div>

              <DualCheckBadge
                passed={result.ai_checked === 1}
                verifiedBy={result.verified_by}
                divergence={result.critic_divergence}
                summary={result.critic_summary}
              />

              <div className="card">
                <h3 className="section-title"><span className="dot" />判定依据（可解释证据链）</h3>
                {result.critic_divergence && (
                  <div
                    className="alert"
                    style={{
                      fontSize: 12,
                      marginBottom: 10,
                      borderColor: 'var(--yellow)',
                      background: 'rgba(245,158,11,0.10)',
                      color: 'var(--yellow)',
                    }}
                  >
                    ⚠️ {providerName(result.ai_provider)}复核与规则引擎判定存在分歧，已以规则引擎（置信度 {Math.round(result.confidence * 100)}%）为准，未被模型幻觉带偏。
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <div className="info-row" style={{ flex: '1 1 180px', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span className="muted" style={{ fontSize: 12 }}>是否安全领域输入</span>
                    <span>{result.evidence?.domain_input ? '是（实验/作业行为）' : '否（非安全领域）'}</span>
                  </div>
                  <div className="info-row" style={{ flex: '1 1 180px', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span className="muted" style={{ fontSize: 12 }}>语义推断等级</span>
                    <RiskTag level={result.evidence?.semantic_level || 'low'} />
                  </div>
                  <div className="info-row" style={{ flex: '1 1 180px', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <span className="muted" style={{ fontSize: 12 }}>独立证据信号数</span>
                    <span>{result.evidence?.signal_count ?? 0} 条</span>
                  </div>
                </div>

                {(() => {
                  const kh = result.evidence?.keyword_hits || {}
                  const anyKw = (kh.high || []).length + (kh.medium || []).length + (kh.low || []).length
                  if (anyKw === 0) return null
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>命中风险词</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(kh.high || []).map((k) => (
                          <span key={'h' + k} className="badge" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>高危 · {k}</span>
                        ))}
                        {(kh.medium || []).map((k) => (
                          <span key={'m' + k} className="badge" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>中危 · {k}</span>
                        ))}
                        {(kh.low || []).map((k) => (
                          <span key={'l' + k} className="badge">{k}</span>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {(result.evidence?.matched_clauses || []).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>匹配条款（TF-IDF 语义相似度）</div>
                    {result.evidence.matched_clauses.map((c, i) => (
                      <div key={i} className="info-row" style={{ gap: 8 }}>
                        <span style={{ flex: 1 }}>{c.clause_ref}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{Math.round((c.match_score || 0) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <h3 className="section-title"><span className="dot" />推演后果（命中条款已高亮）</h3>
                <p style={{ margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{consequenceParts}</p>
              </div>

              <div className="card">
                <h3 className="section-title"><span className="dot" />纠错步骤</h3>
                <div style={{ lineHeight: 1.9 }}>
                  {String(result?.correction || '').split('\n').filter(Boolean).length === 0 ? (
                    <span className="muted">暂无纠错步骤</span>
                  ) : (
                    String(result.correction).split('\n').filter(Boolean).map((line, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                        <span className="step-badge">{i + 1}</span>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{highlightClauses(line, result.source_refs)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card">
                <h3 className="section-title"><span className="dot" />条款溯源（{result.source_refs?.length || 0}）</h3>
                {(result.source_refs || []).length === 0 ? (
                  <div className="muted">本次推演未直接引用条款</div>
                ) : (
                  (result.source_refs || []).map((ref) => (
                    <div key={ref.id} className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <RiskTag level={ref.level} />
                        <span className="muted" style={{ fontSize: 12 }}>权重 {ref.weight}</span>
                      </div>
                      <div style={{ fontSize: 14 }}>{ref.description}</div>
                      <div className="muted" style={{ fontSize: 12 }}>📌 依据：{ref.clause_ref}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
