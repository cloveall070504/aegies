import { useEffect, useState } from 'react'
import { getStudentsOverview } from '../../api'
import { formatTime } from '../../utils/format'

const RISK_META = {
  high: { label: '高危', color: 'var(--red)', bg: 'rgba(239,68,68,0.12)' },
  medium: { label: '中危', color: 'var(--yellow)', bg: 'rgba(245,158,11,0.12)' },
  low: { label: '良好', color: 'var(--green)', bg: 'rgba(16,185,129,0.12)' },
}

export default function StudentManagement() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)

  const load = () => {
    setLoading(true)
    getStudentsOverview('').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>
  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>

  const students = data?.students || []

  return (
    <div>
      <h1 className="page-title">学员管理</h1>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#3b82f6', borderRadius: 999, padding: '4px 10px' }}>教师 / 管理专属</span>
        <span className="muted" style={{ fontSize: 13 }}>共 {data?.total_students ?? 0} 名学员，其中 {data?.at_risk ?? 0} 名需重点关注</span>
      </div>

      {students.length === 0 ? (
        <div className="card empty"><div className="empty-icon">👥</div><div className="empty-text">暂无学员数据</div></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>学员</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>院系</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>风险等级</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>推演数</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>高危/中危</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>平均风险</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>待办作业</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>最近活跃</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const meta = RISK_META[s.risk_level] || RISK_META.low
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.display_name || s.username}</td>
                    <td style={{ padding: '10px 12px' }} className="muted">{s.department || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ color: meta.color, background: meta.bg, borderRadius: 999, padding: '2px 10px', fontWeight: 600 }}>{meta.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.record_count}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--red)' }}>{s.high_count}</span> / <span style={{ color: 'var(--yellow)' }}>{s.medium_count}</span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.avg_risk_score}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.pending_assignments}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }} className="muted">{s.last_infer_at ? formatTime(s.last_infer_at) : '从未'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <button className="btn-outline chip-btn" onClick={() => setDetail(s)}>详情</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="card" style={{ marginTop: 16, border: '1px solid var(--accent, #4f8cff)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />学员风险明细：{detail.display_name || detail.username}</h3>
            <button className="btn-outline chip-btn" onClick={() => setDetail(null)}>关闭</button>
          </div>
          <div className="grid grid-2">
            <div className="card" style={{ background: 'var(--bg-soft)' }}>
              <h4 style={{ margin: '0 0 8px' }}>风险分布</h4>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: 'rgba(239,68,68,0.12)' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{detail.high_count}</div><div className="muted">高危</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: 'rgba(245,158,11,0.12)' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--yellow)' }}>{detail.medium_count}</div><div className="muted">中危</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: 'rgba(16,185,129,0.12)' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{detail.low_count}</div><div className="muted">低危</div>
                </div>
              </div>
            </div>
            <div className="card" style={{ background: 'var(--bg-soft)' }}>
              <h4 style={{ margin: '0 0 8px' }}>概况</h4>
              <div className="info-row"><span>推演总数</span><span className="muted">{detail.record_count}</span></div>
              <div className="info-row"><span>平均风险分</span><span className="muted">{detail.avg_risk_score}</span></div>
              <div className="info-row"><span>待办作业</span><span className="muted">{detail.pending_assignments}</span></div>
              <div className="info-row"><span>最近活跃</span><span className="muted">{detail.last_infer_at ? formatTime(detail.last_infer_at) : '从未'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
