import { useEffect, useState } from 'react'
import {
  listRiskPoints, createRiskPoint, updateRiskPoint, deleteRiskPoint, reviewRiskPoint,
  listPendingFeedback, resolveFeedback,
} from '../../api'
import RiskTag from '../../components/RiskTag'
import ScoreBreakdown from '../../components/ScoreBreakdown'
import useAuthStore from '../../store/authStore'

const SCENE_TYPES = [
  ['chem_lab', '化学实验·标准流程'], ['general', '通用'],
]
const emptyForm = { scene_id: 'chem_lab', description: '', level: 'medium', weight: 0.5, clause_ref: '' }
const REVIEWED_LABEL = { 0: '待审核', 1: '已通过', 2: '已驳回' }
const REVIEWED_COLOR = { 0: '#f59e0b', 1: '#10b981', 2: '#ef4444' }

function FeedbackModal({ record, onClose, onDone }) {
  const [feedback, setFeedback] = useState('')
  const [isMisjudge, setIsMisjudge] = useState(false)
  const [action, setAction] = useState('resolved')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '94%', maxHeight: '88vh', overflowY: 'auto' }}>
        <h3 className="section-title"><span className="dot" />处理学生反馈</h3>
        <div className="card" style={{ boxShadow: 'none', background: 'var(--card-2)', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <RiskTag level={record.level} />
            <span className="muted" style={{ fontSize: 12 }}>风险分 {record.risk_score}</span>
          </div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>{record.behavior}</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>学生反馈：</strong>{record.student_feedback || '（无文字说明）'}
            {record.is_misjudge ? ' · 学生认为判定有误 ⚠️' : ''}
          </div>
          <ScoreBreakdown items={record.score_breakdown} score={record.risk_score} />
        </div>
        <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>教师处理结论（可选）</label>
        <textarea className="input" rows={2} placeholder="如：经复核，该步确属高危，维持原判；或已采纳学生意见修正规则" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', fontSize: 13 }}>
          <input type="checkbox" checked={isMisjudge} onChange={(e) => setIsMisjudge(e.target.checked)} /> 标记为「系统判定有误」（用于后续规则优化）
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[['resolved', '已处理'], ['accepted', '采纳学生意见'], ['rejected', '驳回反馈']].map(([v, l]) => (
            <button key={v} className={action === v ? 'btn' : 'btn-outline'} onClick={() => setAction(v)}>{l}</button>
          ))}
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={saving} onClick={async () => {
            setSaving(true); setError('')
            try { await resolveFeedback(record.record_id, action); onDone() } catch (e) { setError(e.message) } finally { setSaving(false) }
          }}>{saving ? '提交中…' : '提交处理'}</button>
          <button className="btn-outline" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

export default function RiskPointManagement() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('points')

  // ===== 风险点库 =====
  const [points, setPoints] = useState([])
  const [pTotal, setPTotal] = useState(0)
  const [pLoading, setPLoading] = useState(true)
  const [pError, setPError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('')      // ''=全部 seed custom
  const [reviewed, setReviewed] = useState(-1)   // -1 全部 / 0 / 1 / 2
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // ===== 学生反馈 =====
  const [feedbacks, setFeedbacks] = useState([])
  const [fTotal, setFTotal] = useState(0)
  const [fLoading, setFLoading] = useState(false)
  const [fError, setFError] = useState('')
  const [modalRec, setModalRec] = useState(null)

  const loadPoints = (kw = keyword, src = source, rv = reviewed) => {
    setPLoading(true); setPError('')
    listRiskPoints({ keyword: kw, source: src, reviewed: rv, page: 1, page_size: 100 })
      .then((d) => { setPoints(d.items || []); setPTotal(d.total || 0) })
      .catch((e) => setPError(e.message))
      .finally(() => setPLoading(false))
  }
  const loadFeedbacks = () => {
    setFLoading(true); setFError('')
    listPendingFeedback({ page: 1, page_size: 100 })
      .then((d) => { setFeedbacks(d.items || []); setFTotal(d.total || 0) })
      .catch((e) => setFError(e.message))
      .finally(() => setFLoading(false))
  }

  useEffect(() => {
    if (tab === 'points') loadPoints()
    else loadFeedbacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setPError('') }
  const openEdit = (p) => { setEditing(p); setForm({ ...p, weight: p.weight ?? 0.5 }); setShowForm(true); setPError('') }

  const save = async () => {
    if (!form.description.trim()) { setPError('请填写风险点描述'); return }
    setSaving(true); setPError('')
    try {
      if (editing) await updateRiskPoint(editing.id, form)
      else await createRiskPoint(form)
      setShowForm(false); loadPoints()
    } catch (e) { setPError(e.message) } finally { setSaving(false) }
  }
  const onDelete = async (p) => {
    if (p.source === 'seed') { setPError('内置种子风险点不可删除'); return }
    if (!confirm(`确认删除风险点「${p.description}」？`)) return
    try { await deleteRiskPoint(p.id); loadPoints() } catch (e) { setPError(e.message) }
  }
  const onReview = async (p, action) => {
    try { await reviewRiskPoint(p.id, action); loadPoints() } catch (e) { setPError(e.message) }
  }

  const filterBar = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
      <input className="input" style={{ maxWidth: 260 }} placeholder="搜索风险点描述…" value={keyword}
        onChange={(e) => { setKeyword(e.target.value); loadPoints(e.target.value, source, reviewed) }} />
      <select className="select" value={source} onChange={(e) => { setSource(e.target.value); loadPoints(keyword, e.target.value, reviewed) }}>
        <option value="">全部来源</option><option value="seed">内置种子</option><option value="custom">教师自建</option>
      </select>
      <select className="select" value={String(reviewed)} onChange={(e) => { setReviewed(Number(e.target.value)); loadPoints(keyword, source, Number(e.target.value)) }}>
        <option value="-1">全部状态</option><option value="0">待审核</option><option value="1">已通过</option><option value="2">已驳回</option>
      </select>
      <span className="badge">{pTotal} 个风险点</span>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>风险点管理</h1>
        <div className="segmented">
          <button className={tab === 'points' ? 'active' : ''} onClick={() => setTab('points')}>📌 风险点库</button>
          <button className={tab === 'feedback' ? 'active' : ''} onClick={() => setTab('feedback')}>
             💬 学生反馈{isAdmin ? '' : ''}{fTotal > 0 ? `（${fTotal}）` : ''}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#3b82f6', borderRadius: 999, padding: '4px 10px' }}>教学闭环</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {tab === 'points'
            ? '教师维护风险知识库：内置种子可直接编辑（进入待审核），自建风险点需审核后生效，全程可解释'
            : '学生推演中可「质疑判定」，教师在此审核并优化规则，形成错误回流闭环'}
        </span>
      </div>

      {pError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{pError}</div>}

      {/* ===== Tab 1: 风险点库 ===== */}
      {tab === 'points' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn" onClick={openCreate}>＋ 新建风险点</button>
          </div>
          {filterBar}

          {showForm && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title"><span className="dot" />{editing ? '编辑风险点' : '新建风险点'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>风险点描述（禁止/错误行为） *</label>
                  <textarea className="input" rows={2} placeholder="如：未断开电源即进行接线改线" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>风险等级</label>
                    <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                      <option value="high">高危</option><option value="medium">中危</option><option value="low">低危</option>
                    </select>
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>场景</label>
                    <select className="input" value={form.scene_id} onChange={(e) => setForm({ ...form, scene_id: e.target.value })}>
                      {SCENE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>规范权重（0~1）</label>
                    <input className="input" type="number" min="0" max="1" step="0.05" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div>
                  <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>条款溯源</label>
                  <input className="input" placeholder="如：GB 26164.1-2010 第4.3条" value={form.clause_ref} onChange={(e) => setForm({ ...form, clause_ref: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
                  <button className="btn-outline" onClick={() => setShowForm(false)}>取消</button>
                </div>
              </div>
            </div>
          )}

          {pLoading ? (
            <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
          ) : points.length === 0 ? (
            <div className="card empty"><div className="empty-icon">📌</div><div className="empty-text">暂无风险点，点击"新建风险点"开始维护</div></div>
          ) : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px' }}>风险点描述</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>等级</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>来源</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>权重</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>状态</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div>{p.description}</div>
                        {p.clause_ref && <div className="muted" style={{ fontSize: 12 }}>📌 {p.clause_ref}</div>}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}><RiskTag level={p.level} /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }} className="muted">{p.source === 'seed' ? '内置' : '自建'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>{Number(p.weight ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span className="badge" style={{ color: REVIEWED_COLOR[p.reviewed], borderColor: REVIEWED_COLOR[p.reviewed] }}>{REVIEWED_LABEL[p.reviewed]}</span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button className="btn-outline chip-btn" onClick={() => openEdit(p)}>编辑</button>
                        {p.reviewed !== 1 && (
                          <button className="btn-outline chip-btn" style={{ color: 'var(--green)', marginLeft: 6 }} onClick={() => onReview(p, 'approve')}>通过</button>
                        )}
                        {p.reviewed !== 2 && (
                          <button className="btn-outline chip-btn" style={{ color: 'var(--red)', marginLeft: 6 }} onClick={() => onReview(p, 'reject')}>驳回</button>
                        )}
                        {p.source !== 'seed' && (
                          <button className="btn-outline chip-btn" style={{ color: 'var(--red)', marginLeft: 6 }} onClick={() => onDelete(p)}>删除</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== Tab 2: 学生反馈（错误回流审核） ===== */}
      {tab === 'feedback' && (
        <div>
          {fLoading ? (
            <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
          ) : fError ? (
            <div className="alert alert-error">{fError}</div>
          ) : feedbacks.length === 0 ? (
            <div className="card empty"><div className="empty-icon">💬</div><div className="empty-text">暂无待处理的学生反馈</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {feedbacks.map((f) => (
                <div className="card risk-card" key={f.record_id} data-level={f.level} style={{ marginBottom: 0 }}>
                  <div className="risk-card-head">
                    <span className="badge">记录 #{f.record_id}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <RiskTag level={f.level} />
                      <span className="muted">风险分 {f.risk_score}</span>
                      {f.is_misjudge && <span className="badge" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>学生认为误判</span>}
                    </div>
                  </div>
                  <p className="risk-card-desc">操作：{f.behavior}</p>
                  <div className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
                    <strong>学生反馈：</strong>{f.student_feedback || '（无文字说明）'}
                  </div>
                  <ScoreBreakdown items={f.score_breakdown} score={f.risk_score} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn chip-btn" onClick={() => setModalRec(f)}>处理反馈</button>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {f.feedback_at ? `提交于 ${f.feedback_at.replace('T', ' ').slice(0, 19)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modalRec && <FeedbackModal record={modalRec} onClose={() => setModalRec(null)} onDone={() => { setModalRec(null); loadFeedbacks() }} />}
    </div>
  )
}
