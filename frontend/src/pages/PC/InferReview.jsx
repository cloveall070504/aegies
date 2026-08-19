import { useEffect, useState } from 'react'
import { listOperationRecords, getStudentsOverview } from '../../api'
import { formatTime } from '../../utils/format'
import RiskTag from '../../components/RiskTag'

export default function InferReview() {
  const [records, setRecords] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [studentFilter, setStudentFilter] = useState(0)
  const [levelFilter, setLevelFilter] = useState('')
  const [detail, setDetail] = useState(null)

  const load = (uid = studentFilter, lv = levelFilter) => {
    setLoading(true)
    listOperationRecords({ user_id: uid || 0, level: lv || '', limit: 100 })
      .then((d) => setRecords(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    getStudentsOverview('').then((d) => setStudents(d.students || [])).catch(() => {})
  }, [])

  const onFilter = () => load(Number(studentFilter), levelFilter)

  const parseRefs = (s) => {
    try { return (JSON.parse(s || '[]')).map((x) => x.rule || x).join('；') || '—' } catch { return '—' }
  }

  return (
    <div>
      <h1 className="page-title">推演批改</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#3b82f6', borderRadius: 999, padding: '4px 10px' }}>教师审阅</span>
        <span className="muted" style={{ fontSize: 13 }}>审阅学员的 AI 双智能体自检推演记录，定位高危操作并给予反馈</span>
      </div>
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <select className="select" value={studentFilter} onChange={(e) => setStudentFilter(Number(e.target.value))}>
          <option value={0}>全部学员</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.username}</option>)}
        </select>
        <select className="select" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">全部等级</option>
          <option value="high">高危</option>
          <option value="medium">中危</option>
          <option value="low">低危</option>
        </select>
        <button className="btn" onClick={onFilter}>筛选</button>
        <span className="badge">{records.length} 条记录</span>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? <div className="card"><div className="skeleton" style={{ height: 120 }} /></div> : (
        records.length === 0 ? (
          <div className="card empty"><div className="empty-icon">🔍</div><div className="empty-text">暂无推演记录</div></div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>学员</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>操作行为</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>等级</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>风险分</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>AI自检</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>时间</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.student_name}</td>
                    <td style={{ padding: '10px 12px' }}>{r.behavior}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><RiskTag level={r.level} /></td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{r.risk_score}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {r.ai_checked
                        ? (r.critic_divergence
                            ? <span style={{ color: 'var(--yellow)' }}>✓ 通过·分歧</span>
                            : <span style={{ color: 'var(--green)' }}>✓ 通过</span>)
                        : <span style={{ color: 'var(--red)' }}>未通过</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }} className="muted">{r.created_at ? formatTime(r.created_at) : '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}><button className="btn-outline chip-btn" onClick={() => setDetail(r)}>详情</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {detail && (
        <div className="card" style={{ marginTop: 16, border: '1px solid var(--accent, #4f8cff)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />推演明细：{detail.student_name}</h3>
            <button className="btn-outline chip-btn" onClick={() => setDetail(null)}>关闭</button>
          </div>
          <div className="grid grid-2">
            <div className="card" style={{ background: 'var(--bg-soft)' }}>
              <h4 style={{ margin: '0 0 8px' }}>操作与判定</h4>
              <div className="info-row"><span>行为</span><span className="muted" style={{ textAlign: 'right', maxWidth: '70%' }}>{detail.behavior}</span></div>
              <div className="info-row"><span>风险等级</span><RiskTag level={detail.level} /></div>
              <div className="info-row"><span>风险分</span><span className="muted">{detail.risk_score}</span></div>
              <div className="info-row"><span>场景</span><span className="muted">{detail.scene_code || detail.scene_type || '-'}</span></div>
              <div className="info-row"><span>AI 双智能体自检</span><span className={detail.ai_checked ? '' : 'muted'} style={!detail.ai_checked ? { color: 'var(--red)' } : (detail.critic_divergence ? { color: 'var(--yellow)' } : undefined)}>{detail.ai_checked ? (detail.critic_divergence ? '✓ 通过 · 模型有分歧' : '✓ 通过') : '未通过'}</span></div>
            </div>
            <div className="card" style={{ background: 'var(--bg-soft)' }}>
              <h4 style={{ margin: '0 0 8px' }}>改正与溯源</h4>
              <div style={{ fontSize: 13, marginBottom: 8 }}><b>后果：</b><span className="muted">{detail.consequence || '—'}</span></div>
              <div style={{ fontSize: 13, marginBottom: 8 }}><b>正确做法：</b><span className="muted">{detail.correction || '—'}</span></div>
              <div style={{ fontSize: 13 }}><b>条款溯源：</b><span className="muted">{parseRefs(detail.source_refs)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
