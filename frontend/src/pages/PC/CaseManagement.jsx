import { useEffect, useState } from 'react'
import { listCases, createCase, updateCase, deleteCase } from '../../api'
import RiskTag from '../../components/RiskTag'

const emptyForm = { behavior: '', risk_level: 'medium', frequency: 1, status: 'approved', source: 'teacher', scene_type: 'chem_lab', analysis: '' }
const SCENE_TYPES = [
  ['experiment', '化学实验'], ['chem_lab', '化学实验·标准流程'],
]

export default function CaseManagement() {
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = (kw = '') => {
    setLoading(true)
    listCases({ page: 1, page_size: 50, keyword: kw })
      .then((d) => { setCases(d.items || []); setTotal(d.total || 0) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  const openEdit = (c) => { setEditing(c); setForm({ ...c, frequency: c.frequency ?? 1 }); setShowForm(true); setError('') }

  const save = async () => {
    if (!form.behavior.trim()) { setError('请填写行为描述'); return }
    setSaving(true); setError('')
    try {
      if (editing) await updateCase(editing.id, form)
      else await createCase(form)
      setShowForm(false); load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const onDelete = async (c) => {
    if (!confirm(`确认删除案例「${c.behavior}」？`)) return
    try { await deleteCase(c.id); load() } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>案例管理</h1>
        <button className="btn" onClick={openCreate}>＋ 新建案例</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#3b82f6', borderRadius: 999, padding: '4px 10px' }}>教师内容生产</span>
        <span className="muted" style={{ fontSize: 13 }}>创建高危错误案例 → 进入学生案例库 → 学生对照学习，形成教学闭环</span>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title"><span className="dot" />{editing ? '编辑案例' : '新建教学案例'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>错误行为描述 *</label>
              <textarea className="input" rows={2} placeholder="如：未断开电源即进行接线改线" value={form.behavior} onChange={(e) => setForm({ ...form, behavior: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>风险等级</label>
                <select className="input" value={form.risk_level} onChange={(e) => setForm({ ...form, risk_level: e.target.value })}>
                  <option value="high">高危</option><option value="medium">中危</option><option value="low">低危</option>
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>场景类型</label>
                <select className="input" value={form.scene_type} onChange={(e) => setForm({ ...form, scene_type: e.target.value })}>
                  {SCENE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>出现频率</label>
                <input className="input" type="number" min="1" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>正确做法 / 分析</label>
              <textarea className="input" rows={2} placeholder="如：必须先断开电源并验电确认无电后方可作业" value={form.analysis} onChange={(e) => setForm({ ...form, analysis: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={save} disabled={saving}>{saving ? <><span className="spinner" /> 保存中…</> : '保存'}</button>
              <button className="btn-outline" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="card"><div className="skeleton" style={{ height: 120 }} /></div> : (
        cases.length === 0 ? (
          <div className="card empty"><div className="empty-icon">📝</div><div className="empty-text">暂无案例，点击"新建案例"开始创建</div></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>错误行为</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>等级</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>场景</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>频率</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>状态</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>{c.behavior}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><RiskTag level={c.risk_level} /></td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }} className="muted">{c.scene_type}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{c.frequency}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><span className="badge">{c.status}</span></td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button className="btn-outline chip-btn" onClick={() => openEdit(c)}>编辑</button>
                      <button className="btn-outline chip-btn" style={{ color: 'var(--red)', marginLeft: 8 }} onClick={() => onDelete(c)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ padding: '10px 12px', fontSize: 12 }}>共 {total} 条案例（学生端「案例库」实时同步）</div>
          </div>
        )
      )}
    </div>
  )
}
