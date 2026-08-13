import { useEffect, useState } from 'react'
import { generateReport, getOrgDashboard, listReports } from '../../api'
import RiskTag from '../../components/RiskTag'
import { formatTime } from '../../utils/format'

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [orgId, setOrgId] = useState('')
  const [reports, setReports] = useState([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const load = async (oid = orgId) => {
    setError('')
    try {
      const d = await getOrgDashboard(oid)
      setData(d)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load('default_org')
    listReports().then(setReports).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const genReport = async () => {
    setGenerating(true)
    setError('')
    try {
      await generateReport('org', orgId)
      const r = await listReports()
      setReports(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const dist = data?.risk_distribution || {}
  const topErrors = data?.top_errors || []
  const stats = data?.member_stats || {}

  return (
    <div>
      <h1 className="page-title">管理端组织风险画像</h1>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="muted">组织/班级：</label>
        <input className="input" style={{ maxWidth: 220 }} value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="如 default_org" />
        <button className="btn" onClick={() => load()}>查询</button>
        <button className="btn-outline" onClick={genReport} disabled={generating}>
          {generating ? '生成中…' : '生成组织报告'}
        </button>
      </div>
      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>}

      {data && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 16 }}>
            <div className="card" style={{ borderTop: '4px solid var(--red)' }}>
              <div className="muted">高危</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{dist.high ?? 0}</div>
            </div>
            <div className="card" style={{ borderTop: '4px solid var(--yellow)' }}>
              <div className="muted">中危</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{dist.medium ?? 0}</div>
            </div>
            <div className="card" style={{ borderTop: '4px solid var(--green)' }}>
              <div className="muted">低危</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{dist.low ?? 0}</div>
            </div>
            <div className="card">
              <div className="muted">成员数</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.member_count ?? 0}</div>
            </div>
            <div className="card">
              <div className="muted">平均自测分</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{stats.avg_quiz_score ?? 0}</div>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>高频错误排行</h3>
              {topErrors.length === 0 && <div className="muted">暂无数据</div>}
              {topErrors.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {i + 1}. {t.behavior}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--primary)' }}>{t.count} 次</span>
                </div>
              ))}
            </div>
            <div className="card">
              <h3 style={{ margin: '0 0 12px' }}>已生成报告</h3>
              {reports.length === 0 && <div className="muted">暂无报告</div>}
              {reports.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 14 }}>{r.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.type} · {formatTime(r.generated_at)}</div>
                  </div>
                  <a href={`/api/v1/report/${r.id}/download`} target="_blank" rel="noreferrer" style={{ alignSelf: 'center', fontSize: 13 }}>下载</a>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {!data && !error && <div className="muted">输入组织ID后点击查询</div>}
    </div>
  )
}
