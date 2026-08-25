import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import ScoreGauge from '../../components/ScoreGauge'
import RiskTag from '../../components/RiskTag'
import DualCheckBadge from '../../components/DualCheckBadge'
import RiskCard from '../../components/RiskCard'
import PageHead from '../../components/PageHead'
import EngineModeBadge from '../../components/EngineModeBadge'
import ScoreBreakdown from '../../components/ScoreBreakdown'
import { useScan } from '../../hooks/useScan'
import { listScenes } from '../../api/scenes'
import { isAllowedScene } from '../../utils/sceneFilter'
import { scanText, simulateStep, submitFeedback, asList } from '../../api'
import { useMascotStore, moodFromLevel } from '../../store/mascotStore'

const DEMO = '实验前未佩戴护目镜，直接打开浓硫酸试剂瓶。\n将水倒入浓硫酸中稀释。\n实验结束后未关闭酒精灯就离开实验室。'

// 根据当前 AI provider 渲染引擎标签/说明（cloud=千问，ollama=本地，rule=规则引擎）
function providerBadge(aiProvider, trustMode) {
  if (trustMode !== 'llm_enhanced') return '⚙️ 规则引擎'
  if (aiProvider === 'cloud') return '☁️ 千问云端'
  return '🤖 Ollama 增强'
}

function providerSubtitle(aiProvider, verifiedBy) {
  if (verifiedBy !== 'rule_engine+llm_critic') {
    return '未启用 AI 模型，判定由规则引擎完成（可离线）'
  }
  if (aiProvider === 'cloud') return '千问云端模型仅增强解释，判定以规则引擎为准'
  return '本地模型仅增强解释，判定以规则引擎为准'
}

function providerName(aiProvider) {
  if (aiProvider === 'cloud') return '千问模型'
  if (aiProvider === 'ollama') return '本地模型'
  return 'AI 模型'
}

// 高亮命中条款关键词（与推演页一致）
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

// 渲染单步可信化证据（来自推演引擎）
function EvidenceBlock({ result }) {
  const ev = result.evidence || {}
  const kh = ev.keyword_hits || {}
  const anyKw = (kh.high || []).length + (kh.medium || []).length + (kh.low || []).length
  const conf = Math.round((result.confidence || 0) * 100)
  return (
    <div className="card" style={{ marginTop: 14, boxShadow: 'none', background: 'var(--card-2)' }}>
      <h3 className="section-title"><span className="dot" />判定依据（可解释证据链）</h3>
      {result.critic_divergence && (
        <div className="alert alert-warning" style={{ fontSize: 12 }}>
          ⚠️ {providerName(result.ai_provider)}复核与规则引擎判定存在分歧，已以规则引擎（置信度 {conf}%）为准，未被模型幻觉带偏。
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div className="info-row" style={{ flex: '1 1 160px', flexDirection: 'column', alignItems: 'flex-start', gap: 2, borderBottom: 'none' }}>
          <span className="muted" style={{ fontSize: 12 }}>是否安全领域输入</span>
          <span>{ev.domain_input ? '是（实验/作业行为）' : '否（非安全领域）'}</span>
        </div>
        <div className="info-row" style={{ flex: '1 1 160px', flexDirection: 'column', alignItems: 'flex-start', gap: 2, borderBottom: 'none' }}>
          <span className="muted" style={{ fontSize: 12 }}>语义推断等级</span>
          <RiskTag level={ev.semantic_level || 'low'} />
        </div>
        <div className="info-row" style={{ flex: '1 1 160px', flexDirection: 'column', alignItems: 'flex-start', gap: 2, borderBottom: 'none' }}>
          <span className="muted" style={{ fontSize: 12 }}>独立证据信号数</span>
          <span>{ev.signal_count ?? 0} 条</span>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, margin: '12px 0 4px' }}>判定置信度 {conf}%</div>
      <div className="progress" style={{ height: 8 }}>
        <span style={{ width: `${conf}%`, background: conf >= 60 ? 'linear-gradient(90deg,var(--green),var(--green-2))' : conf >= 35 ? 'linear-gradient(90deg,var(--yellow),var(--yellow-2))' : 'linear-gradient(90deg,var(--red),var(--red-2))' }} />
      </div>

      {anyKw > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>命中风险词</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(kh.high || []).map((k) => <span key={'h' + k} className="tag tag-high">{k}</span>)}
            {(kh.medium || []).map((k) => <span key={'m' + k} className="tag tag-medium">{k}</span>)}
            {(kh.low || []).map((k) => <span key={'l' + k} className="tag tag-low">{k}</span>)}
          </div>
        </div>
      )}

      {(ev.matched_clauses || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>匹配条款（TF-IDF 语义相似度）</div>
          {ev.matched_clauses.map((c, i) => (
            <div key={i} className="info-row" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>{c.clause_ref}</span>
              <span className="muted" style={{ fontSize: 12 }}>{Math.round((c.match_score || 0) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {(result.source_refs || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>条款溯源（{result.source_refs.length}）</div>
          {result.source_refs.map((ref) => (
            <div key={ref.id} className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <RiskTag level={ref.level} />
                <span className="muted" style={{ fontSize: 12 }}>权重 {ref.weight}</span>
              </div>
              <div style={{ fontSize: 14 }}>{ref.description}</div>
              <div className="muted" style={{ fontSize: 12 }}>📌 依据：{ref.clause_ref}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 单步「质疑/补充判定」反馈（A2 学生错误回流闭环入口）
function StepFeedback({ recordId, done, onDone }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [mis, setMis] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  if (done) {
    return <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>✅ 已提交反馈，等待教师审核</div>
  }
  return (
    <div style={{ marginTop: 12 }}>
      {!open ? (
        <button className="btn-outline chip-btn" onClick={() => setOpen(true)}>💬 质疑 / 补充这次判定</button>
      ) : (
        <div className="card" style={{ boxShadow: 'none', background: 'var(--card-2)' }}>
          <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
            你的反馈（如：这一步其实是安全的 / 风险等级偏高 / 描述有歧义）
          </label>
          <textarea className="input" rows={2} placeholder="说明你的判断…" value={text} onChange={(e) => setText(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: 13 }}>
            <input type="checkbox" checked={mis} onChange={(e) => setMis(e.target.checked)} /> 我认为系统判定有误
          </label>
          {err && <div className="alert alert-error" style={{ marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={saving} onClick={async () => {
              setSaving(true); setErr('')
              try { await submitFeedback(recordId, text, mis); setOpen(false); onDone() }
              catch (e) { setErr(e.message) } finally { setSaving(false) }
            }}>{saving ? '提交中…' : '提交反馈'}</button>
            <button className="btn-outline" onClick={() => setOpen(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Sandbox() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState('live')
  const [scenes, setScenes] = useState([])
  const [sceneId, setSceneId] = useState('')

  // 分析我的方案（scan 模式）
  const [planText, setPlanText] = useState('')
  const [planFindings, setPlanFindings] = useState(null)
  const [planSummary, setPlanSummary] = useState(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')

  // 交互推演（live 模式）
  const [stepInput, setStepInput] = useState('')
  const [timeline, setTimeline] = useState([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState('')
  const [fbDone, setFbDone] = useState({})   // record_id -> 已提交反馈

  // 风险点库（复用 useScan）
  const scan = useScan()

  // 沙盘联动小助手：根据每步风险等级驱动公仔情绪（高危→alert 跑路动作）
  const setMood = useMascotStore((s) => s.setMood)

  useEffect(() => {
    listScenes().then((d) => {
      const list = asList(d)
        .filter(isAllowedScene)
        .map((s) => ({ ...s, scene_id: s.scene_code }))
      setScenes(list)
      if (!sceneId && list[0]) setSceneId(list[0].scene_id)
      if (list[0]) scan.runScan(list[0].scene_id)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 从案例库/方案跳转而来：?behavior= 预填并直接推演
  useEffect(() => {
    const b = params.get('behavior')
    if (b) {
      setTab('live')
      setStepInput(b)
      runLive(b)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runLive = useCallback(async (stepText) => {
    const s = (stepText ?? '').toString().trim()
    if (!s) return
    setLiveLoading(true); setLiveError('')
    try {
      const history = timeline.map((t) => t.step)
      const res = await simulateStep(s, sceneId, history)
      setTimeline((prev) => [...prev, { step: s, result: res }])
      // 驱动小助手联动：高危时摆出 alert 跑路动作 + 红色警示，安全时给赞许
      const m = moodFromLevel(res.level)
      setMood(m, m === 'alert' ? 15000 : 6000)
      setStepInput('')
    } catch (e) {
      setLiveError(e.message)
    } finally {
      setLiveLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, timeline])

  const onPlan = async () => {
    if (!planText.trim()) return
    setPlanLoading(true); setPlanError(''); setPlanFindings(null); setPlanSummary(null)
    try {
      const d = await scanText(planText, sceneId)
      setPlanFindings(d.findings || [])
      setPlanSummary(d.summary || {})
    } catch (e) {
      setPlanError(e.message)
    } finally {
      setPlanLoading(false)
    }
  }

  const enterLiveFromPlan = (step) => {
    setTab('live')
    setStepInput(step)
    runLive(step)
  }

  const restartLive = () => {
    setTimeline([])
    setStepInput('')
    setLiveError('')
    setMood('neutral')
  }

  // 离开沙盘页时让小助手情绪回落，避免卡在 alert 跑路动作
  useEffect(() => () => setMood('neutral'), [setMood])

  const last = timeline[timeline.length - 1]
  const terminated = !!last?.result?.terminated

  return (
    <div>
      <PageHead
        eyebrow="交互式情景推演"
        title="避错沙盘"
        desc="把你的操作步骤逐步放进沙盘：系统实时分析风险（可信化判定 + 关联案例），并模拟「这一步之后会发生什么」，让你在零风险环境里练出肌肉记忆。"
      />

      <EngineModeBadge variant="banner" />

      <div className="row-between" style={{ marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div className="segmented">
          <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>🎮 交互推演</button>
          <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>📝 分析方案</button>
          <button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>📚 风险点库</button>
        </div>
        <select className="select" style={{ maxWidth: 240 }} value={sceneId} onChange={(e) => {
          setSceneId(e.target.value)
          if (tab === 'catalog') scan.runScan(e.target.value)
        }}>
          {scenes.map((s) => (<option key={s.scene_id} value={s.scene_id}>{s.icon} {s.name}</option>))}
        </select>
      </div>

      {/* ===== 交互推演 ===== */}
      {tab === 'live' && (
        <div>
          <div className="card console" style={{ marginBottom: 18 }}>
            <label className="muted" style={{ fontSize: 13 }}>描述你「这一步」要做的操作（可来自案例剧本或自己的真实步骤）：</label>
            <textarea
              className="textarea"
              style={{ marginTop: 10 }}
              placeholder="例如：加热试管时试管口朝向自己；或未佩戴护目镜操作腐蚀性试剂…"
              value={stepInput}
              onChange={(e) => setStepInput(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => runLive(stepInput)} disabled={liveLoading || !stepInput.trim()}>
                {liveLoading ? <><span className="spinner" /> 推演中…</> : '🚀 执行这一步'}
              </button>
              {timeline.length > 0 && <button className="btn-outline" onClick={restartLive}>重新开始</button>}
              <button className="btn-outline" onClick={() => { setStepInput(DEMO.split('\n')[0]); }}>填入示例</button>
            </div>
            {liveError && <div className="alert alert-error" style={{ marginTop: 12 }}>{liveError}</div>}
          </div>

          {timeline.length === 0 && (
            <div className="card empty">
              <div className="empty-icon">🎮</div>
              <div className="empty-text">输入第一步操作，点击「执行这一步」开始推演</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>每执行一步，沙盘会给出风险判定、仿真后果与下一步选项</div>
            </div>
          )}

          <div className="timeline">
            {timeline.map((entry, idx) => {
              const r = entry.result
              const isLast = idx === timeline.length - 1
              const consParts = highlightClauses(r.consequence, r.source_refs)
              const corrParts = highlightClauses(r.correction, r.source_refs)
              return (
                <div className="card risk-card" key={idx} data-level={r.level} style={{ marginBottom: 0 }}>
                  <div className="risk-card-head">
                    <span className="badge">第 {idx + 1} 步</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <RiskTag level={r.level} />
                      <span className="muted">风险分 {r.risk_score}</span>
                    </div>
                  </div>
                  <p className="risk-card-desc">操作：{entry.step}</p>

                  {/* 仿真旁白（LLM/规则叙事，诚实标注来源） */}
                  <div className="narrative" data-level={r.level}>
                    <span className="narrative-label">
                      🎬 仿真旁白 · {(r.actor_reply && r.actor_reply.trim()) ? 'AI 生成' : '规则引擎生成'}
                    </span>
                    {r.world_reaction}
                  </div>

                  <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
                    <ScoreGauge score={r.risk_score} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <strong style={{ fontSize: 16 }}>风险等级</strong>
                        <RiskTag level={r.level} />
                        <span className="badge">{providerBadge(r.ai_provider, r.trust_mode)}</span>
                      </div>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{providerSubtitle(r.ai_provider, r.verified_by)}</p>
                    </div>
                  </div>

                  <DualCheckBadge passed={r.ai_checked === 1} verifiedBy={r.verified_by} divergence={r.critic_divergence} summary={r.critic_summary} />

                  {/* A3：评分透明化——展示规则引擎逐项加分明细 */}
                  <ScoreBreakdown items={r.score_breakdown} score={r.risk_score} />

                  <div style={{ marginTop: 14 }}>
                    <h3 className="section-title"><span className="dot" />推演后果</h3>
                    <p style={{ margin: 0, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{consParts}</p>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <h3 className="section-title"><span className="dot" />纠错步骤</h3>
                    <div style={{ lineHeight: 1.9 }}>
                      {String(corrParts || '').split('\n').filter(Boolean).length === 0 ? corrParts : (
                        String(corrParts).split('\n').filter(Boolean).map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                            <span className="step-badge">{i + 1}</span><span>{s}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <EvidenceBlock result={r} />

                  {/* A2：学生错误回流闭环入口——对本次判定提交反馈 */}
                  {r.record_id != null && (
                    <StepFeedback
                      recordId={r.record_id}
                      done={!!fbDone[r.record_id]}
                      onDone={() => setFbDone((p) => ({ ...p, [r.record_id]: true }))}
                    />
                  )}

                  {r.related_case_ids?.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <button className="btn-outline chip-btn" onClick={() => navigate('/cases')}>查看 {r.related_case_ids.length} 个相关案例 →</button>
                    </div>
                  )}

                  {/* 最后一步且未终止：给出下一步分支 */}
                  {isLast && !terminated && r.next_options?.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
                      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>👇 你的下一步怎么选？（点击后沙盘继续推演）</div>
                      <div className="next-options">
                        {r.next_options.map((opt, i) => (
                          <button key={i} className="next-option" onClick={() => runLive(opt.suggest_next || '')}>
                            <span>{opt.label}</span>
                            {opt.hint && <span className="opt-hint">{opt.hint}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 高危终止 */}
                  {isLast && terminated && (
                    <div className="alert alert-error" style={{ marginTop: 16 }}>
                      🛑 {r.termination_reason}。推演已终止——真实实验中请绝对避免这一步。
                      <div style={{ marginTop: 10 }}><button className="btn-outline" onClick={restartLive}>重新开始推演</button></div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== 分析我的方案（scan 模式） ===== */}
      {tab === 'plan' && (
        <div>
          <div className="card console" style={{ marginBottom: 18 }}>
            <label className="muted" style={{ fontSize: 13 }}>粘贴你的实验步骤 / 操作方案，逐行分析风险（每行一步）：</label>
            <textarea
              className="textarea"
              style={{ marginTop: 10 }}
              placeholder={DEMO}
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={onPlan} disabled={planLoading || !planText.trim()}>
                {planLoading ? <><span className="spinner" /> 扫描中…</> : '🔍 开始分析'}
              </button>
              <button className="btn-outline" onClick={() => setPlanText(DEMO)}>填入示例</button>
            </div>
            {planError && <div className="alert alert-error" style={{ marginTop: 12 }}>{planError}</div>}
          </div>

          {tab === 'plan' && planSummary && (
            <div className="stat-row" style={{ marginBottom: 18 }}>
              <div className="card stat-card" data-level="high"><div className="stat-label">高危步骤</div><div className="stat-num">{planSummary.high ?? 0}</div></div>
              <div className="card stat-card" data-level="medium"><div className="stat-label">中危步骤</div><div className="stat-num">{planSummary.medium ?? 0}</div></div>
              <div className="card stat-card" data-level="low"><div className="stat-label">低危步骤</div><div className="stat-num">{planSummary.low ?? 0}</div></div>
              <div className="card stat-card"><div className="stat-label">安全/未识别</div><div className="stat-num">{planSummary.none ?? 0}</div></div>
            </div>
          )}

          {tab === 'plan' && planFindings && (
            planFindings.length === 0
              ? <div className="card empty"><div className="empty-icon">✅</div><div className="empty-text">未检测到风险步骤</div></div>
              : <div className="grid grid-2">
                  {planFindings.map((f) => (
                    <div className="card risk-card" key={f.index} data-level={f.level}>
                      <div className="risk-card-head">
                        <span className="badge">第 {f.index} 步</span>
                        <RiskTag level={f.level} />
                      </div>
                      <p className="risk-card-desc">{f.step}</p>
                      {f.matched_clauses?.length > 0 && (
                        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>违反条款：{f.matched_clauses[0]}</div>
                      )}
                      <p style={{ fontSize: 13, lineHeight: 1.7, margin: '6px 0' }}>{f.consequence}</p>
                      <div className="muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{f.correction}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                        <button className="btn chip-btn" onClick={() => enterLiveFromPlan(f.step)}>进入推演这步</button>
                        {f.related_case_ids?.length > 0 && (
                          <button className="btn-outline chip-btn" onClick={() => navigate('/cases')}>查看相关案例</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
          )}
        </div>
      )}

      {/* ===== 风险点库（catalog 模式） ===== */}
      {tab === 'catalog' && (
        <div>
          <div className="toolbar">
            <label className="muted">选择场景：</label>
            <select className="select" style={{ maxWidth: 320 }} value={sceneId} onChange={(e) => { setSceneId(e.target.value); scan.runScan(e.target.value) }}>
              {scenes.map((s) => (<option key={s.scene_id} value={s.scene_id}>{s.icon} {s.name}</option>))}
            </select>
            <span className="badge">{scan.total ?? 0} 个风险点</span>
          </div>
          {scan.error && <div className="alert alert-error">{scan.error}</div>}
          {scan.risks.length > 0 ? (
            <div className="grid grid-2">
              {scan.risks.map((r) => (<RiskCard key={r.id} item={r} />))}
            </div>
          ) : (
            !scan.loading && <div className="card empty"><div className="empty-icon">🔍</div><div className="empty-text">该场景暂无风险点</div></div>
          )}
        </div>
      )}
    </div>
  )
}
