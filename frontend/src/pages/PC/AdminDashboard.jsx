import { useEffect, useState } from 'react'
import { generateReport, getOrgDashboard, listReports } from '../../api'
import { formatTime } from '../../utils/format'
import useAuthStore from '../../store/authStore'
import UserManagement from '../../components/UserManagement'

export default function AdminDashboard() {
  const [tab, setTab] = useState('org')
  const [data, setData] = useState(null)
  const role = useAuthStore((s) => s.user?.role)
  const [orgId, setOrgId] = useState('default_org')
  const [reports, setReports] = useState([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const token = useAuthStore((s) => s.token)

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
      await generateReport('org', orgId || 'default_org')
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
  const availableOrgs = data?.available_orgs || []
  // 培训前后对比
  const beforeRisk = stats.before_avg_risk ?? 0
  const afterRisk = stats.after_avg_risk ?? 0
  const riskDrop = beforeRisk > 0 ? Math.round((beforeRisk - afterRisk) / beforeRisk * 100) : 0

  return (
    <div>
      <h1 className="page-title">管理端</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={tab === 'org' ? 'btn' : 'btn-outline'} onClick={() => setTab('org')}>📊 组织风险画像</button>
        {role === 'admin' && (
          <button className={tab === 'users' ? 'btn' : 'btn-outline'} onClick={() => setTab('users')}>👥 用户管理（新建/分配角色）</button>
        )}
      </div>

      {tab === 'users' ? (
        <UserManagement />
      ) : (
        <>
      <div className="hero">
        <div className="hero-title">一班一图 · 培训留痕</div>
        <div className="hero-sub">班级/班组风险分布 · 高频错误排行 · 整改状态 · 培训前后对比</div>
      </div>
      <div className="toolbar">
        <label className="muted">组织/班级：</label>
        <select className="select" style={{ maxWidth: 220 }} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="default_org">全部（默认）</option>
          {availableOrgs.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <button className="btn" onClick={() => load()}>查询</button>
        <button className="btn-outline" onClick={genReport} disabled={generating}>
          {generating ? <><span className="spinner" /> 生成中…</> : '📑 生成组织报告'}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {data && (
        <>
          <div className="stat-row">
            <div className="card stat-card" data-level="high">
              <div className="muted">高危</div>
              <div className="stat-num">{dist.high ?? 0}</div>
            </div>
            <div className="card stat-card" data-level="medium">
              <div className="muted">中危</div>
              <div className="stat-num">{dist.medium ?? 0}</div>
            </div>
            <div className="card stat-card" data-level="low">
              <div className="muted">低危</div>
              <div className="stat-num">{dist.low ?? 0}</div>
            </div>
            <div className="card stat-card">
              <div className="muted">成员数</div>
              <div className="stat-num">{stats.member_count ?? 0}</div>
            </div>
            <div className="card stat-card">
              <div className="muted">平均自测分</div>
              <div className="stat-num">{stats.avg_quiz_score ?? 0}</div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3 className="section-title"><span className="dot" />培训前后对比</h3>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div className="muted" style={{ fontSize: 12 }}>培训前平均风险分</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{beforeRisk}</div>
                </div>
                <div style={{ fontSize: 24 }}>→</div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div className="muted" style={{ fontSize: 12 }}>培训后平均风险分</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>{afterRisk}</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span className="badge" style={{ background: riskDrop > 0 ? 'rgba(16,185,129,0.15)' : 'var(--primary-weak)', color: riskDrop > 0 ? 'var(--green)' : 'var(--primary)' }}>
                  {riskDrop > 0 ? '📉' : '➡️'} 风险分下降 {Math.abs(riskDrop)}%
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>
                统计：{stats.record_count ?? 0} 条推演 · {stats.quiz_count ?? 0} 次自测
              </div>
            </div>

            <div className="card">
              <h3 className="section-title"><span className="dot" />高频错误排行</h3>
              {topErrors.length === 0 ? (
                <div className="empty"><div className="empty-icon">📊</div><div className="empty-text">暂无数据</div></div>
              ) : (
                topErrors.map((t, i) => (
                  <div key={i} className="rank-row">
                    <span className="rank-text"><span className="badge" style={{ marginRight: 8 }}>{i + 1}</span>{t.behavior}</span>
                    <span className="rank-count">{t.count} 次</span>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <h3 className="section-title"><span className="dot" />已生成报告</h3>
              {reports.length === 0 ? (
                <div className="empty"><div className="empty-icon">📑</div><div className="empty-text">暂无报告</div></div>
              ) : (
                reports.map((r) => (
                  <div key={r.id} className="rank-row">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.type} · {formatTime(r.generated_at)}</div>
                    </div>
                    <a className="dl-link" href={`/api/v1/report/${r.id}/download?token=${encodeURIComponent(token || '')}`} target="_blank" rel="noreferrer">下载</a>
                  </div>
                ))
              )}
            </div>

            <div className="card">
              <h3 className="section-title"><span className="dot" />组织风险分布</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.12)' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{dist.high ?? 0}</div>
                  <div className="muted" style={{ fontSize: 12 }}>高危</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.12)' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--yellow)' }}>{dist.medium ?? 0}</div>
                  <div className="muted" style={{ fontSize: 12 }}>中危</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.12)' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{dist.low ?? 0}</div>
                  <div className="muted" style={{ fontSize: 12 }}>低危</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {!data && !error && <div className="card"><div className="skeleton" style={{ height: 100 }} /></div>}
        </>
      )}
    </div>
  )
}
