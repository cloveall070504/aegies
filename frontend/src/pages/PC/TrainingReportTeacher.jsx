import { useEffect, useState } from 'react'
import { generateReport, getOrgDashboard, getStudentsOverview, listReports, asList } from '../../api'
import { formatTime } from '../../utils/format'
import useAuthStore from '../../store/authStore'

const parse = (s, fb) => {
  if (s == null) return fb
  if (typeof s === 'string') {
    try { const v = JSON.parse(s); return v == null ? fb : v } catch { return fb }
  }
  return s
}

export default function TrainingReportTeacher() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  // 默认锁定教师本人所在班级（department），未配置时回退到全部（default_org）
  const [orgId, setOrgId] = useState(user?.department || 'default_org')
  const [students, setStudents] = useState(null)
  const [org, setOrg] = useState(null)
  const [availableOrgs, setAvailableOrgs] = useState([])
  const [reports, setReports] = useState([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    // 概览卡片与学员名单统一使用同一个 orgId，避免范围不一致
    getOrgDashboard(orgId)
      .then((d) => { setOrg(d); setAvailableOrgs(d?.available_orgs || []) })
      .catch((e) => setError(e.message))
    getStudentsOverview(orgId).then(setStudents).catch(() => {})
    listReports().then((d) => setReports(asList(d))).catch(() => {})
  }
  // 组织切换或首次加载都重新拉取，保证两块数据同源
  useEffect(() => { load() }, [orgId])

  const gen = async () => {
    setGenerating(true); setError('')
    try {
      await generateReport('org', orgId)
      const r = await listReports()
      setReports(asList(r))
    } catch (e) { setError(e.message) } finally { setGenerating(false) }
  }

  const dist = parse(org?.risk_distribution, { high: 0, medium: 0, low: 0 })
  const topErrors = parse(org?.top_errors, [])
  const stats = parse(org?.member_stats, {})

  return (
    <div>
      <h1 className="page-title">培训报告</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#3b82f6', borderRadius: 999, padding: '4px 10px' }}>闭环输出</span>
        <span className="muted" style={{ fontSize: 13 }}>汇总班级风险掌握度与高频错误，生成可下载的整改报告</span>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 className="section-title"><span className="dot" />班级安全态势</h3>
          <div className="stat-row">
            <div className="stat-card"><div className="muted">学员总数</div><div className="stat-num">{students?.total_students ?? 0}</div></div>
            <div className="stat-card" data-level="high"><div className="muted">重点关注</div><div className="stat-num">{students?.at_risk ?? 0}</div></div>
            <div className="stat-card"><div className="muted">高危行为</div><div className="stat-num">{dist.high ?? 0}</div></div>
            <div className="stat-card"><div className="muted">中危行为</div><div className="stat-num">{dist.medium ?? 0}</div></div>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>培训前后平均风险：{stats.before_avg_risk ?? 0} → {stats.after_avg_risk ?? 0}</div>
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />高频错误 Top 5</h3>
          {topErrors.length === 0 ? <div className="empty"><div className="empty-icon">📊</div><div className="empty-text">暂无数据</div></div> : (
            topErrors.slice(0, 5).map((t, i) => (
              <div key={i} className="rank-row">
                <span className="rank-text"><span className="badge" style={{ marginRight: 8 }}>{i + 1}</span>{t.behavior}</span>
                <span className="rank-count">{t.count} 次</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label className="muted">组织/班级：</label>
        <select className="select" style={{ maxWidth: 220 }} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="default_org">全部（默认）</option>
          {availableOrgs.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>默认锁定本人班级「{user?.department || '未配置'}」</span>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 className="section-title" style={{ margin: '0 0 4px' }}><span className="dot" />生成整改报告（PDF）</h3>
          <div className="muted" style={{ fontSize: 13 }}>面向组织：{orgId === 'default_org' ? '全部（非管理员）' : orgId}</div>
        </div>
        <button className="btn" onClick={gen} disabled={generating}>{generating ? <><span className="spinner" /> 生成中…</> : '📑 生成培训报告'}</button>
      </div>

      <div className="card">
        <h3 className="section-title"><span className="dot" />已生成报告</h3>
        {reports.length === 0 ? <div className="empty"><div className="empty-icon">📑</div><div className="empty-text">暂无报告</div></div> : (
          reports.map((r) => (
            <div key={r.id} className="rank-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>{r.type} · {formatTime(r.generated_at || r.created_at)}</div>
              </div>
              <a className="dl-link" href={`/api/v1/report/${r.id}/download?token=${encodeURIComponent(token || '')}`} target="_blank" rel="noreferrer">下载</a>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
