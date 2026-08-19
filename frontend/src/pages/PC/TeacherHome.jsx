import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatTime } from '../../utils/format'
import PageHead from '../../components/PageHead'
import { getOrgDashboard, getStudentsOverview, listAssignments, listCases, listReports, asList } from '../../api'
import useAuthStore from '../../store/authStore'

const parse = (s, fallback) => {
  try { return typeof s === 'string' ? JSON.parse(s) : s } catch { return fallback }
}

export default function TeacherHome() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [students, setStudents] = useState(null)
  const [myAssignments, setMyAssignments] = useState(0)
  const [caseTotal, setCaseTotal] = useState(0)
  const [reportCount, setReportCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    getOrgDashboard('').then(setOrg).catch((e) => setError(e.message))
    getStudentsOverview('').then(setStudents).catch(() => {})
    listAssignments('active').then((d) => setMyAssignments(asList(d).length)).catch(() => {})
    listCases({ page: 1, page_size: 1 }).then((d) => setCaseTotal(d.total || 0)).catch(() => {})
    listReports().then((d) => setReportCount(asList(d).length)).catch(() => {})
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!org) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>

  const dist = parse(org.risk_distribution, { high: 0, medium: 0, low: 0 })
  const stats = parse(org.member_stats, {})
  const topErrors = parse(org.top_errors, [])
  const total = (dist.high ?? 0) + (dist.medium ?? 0) + (dist.low ?? 0) || 1
  const atRisk = students?.at_risk ?? 0
  const topStudents = (students?.students || []).slice(0, 5)

  return (
    <div>
      <PageHead
        eyebrow="教学管理者专区"
        title="教学工作台"
        desc={`${user?.display_name || user?.username}，班级安全态势与培训进度一目了然`}
      />

      {/* 教学闭环：内容生产 → 布置 → 学生实操 → 审阅 → 报告 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="tag">教学闭环</span>
          <span className="muted" style={{ fontSize: 13 }}>教师生产内容 → 布置作业 → 学生实操 → 教师审阅 → 生成报告，闭环驱动持续改进</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
          {[
            { icon: '📝', label: '案例管理', sub: `${caseTotal} 个案例`, to: '/cases-manage' },
            { icon: '📋', label: '作业布置', sub: `${myAssignments} 项进行中`, to: '/assignments' },
            { icon: '🧪', label: '学员推演', sub: `${students?.total_students ?? 0} 名学员`, to: '/students' },
            { icon: '🔍', label: '推演批改', sub: '审阅反馈', to: '/review' },
            { icon: '📑', label: '培训报告', sub: `${reportCount} 份已生成`, to: '/training-report' },
          ].map((s, i, arr) => (
            <div key={s.label} style={{ flex: '1 1 130px', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--card-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 22 }}>{s.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</div>
                <div className="muted" style={{ fontSize: 11 }}>{s.sub}</div>
              </div>
              {i < arr.length - 1 && <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 800 }}>→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon">👥</span><span className="kpi-label">班级人数</span></div>
          <div className="kpi-value">{stats.member_count ?? 0}</div>
        </div>
        <div className="kpi" data-tone="high">
          <div className="kpi-top"><span className="kpi-icon">⚠️</span><span className="kpi-label">高危行为数</span></div>
          <div className="kpi-value">{dist.high ?? 0}</div>
        </div>
        <div className="kpi" data-tone="medium">
          <div className="kpi-top"><span className="kpi-icon">🎯</span><span className="kpi-label">重点关注学员</span></div>
          <div className="kpi-value">{atRisk}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon">📋</span><span className="kpi-label">我发布的作业</span></div>
          <div className="kpi-value">{myAssignments}</div>
        </div>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="card">
          <h3 className="section-title"><span className="dot" />班级风险分布</h3>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <div className="kpi" data-tone="high"><div className="kpi-label">高危</div><div className="kpi-value">{dist.high ?? 0}</div></div>
            <div className="kpi" data-tone="medium"><div className="kpi-label">中危</div><div className="kpi-value">{dist.medium ?? 0}</div></div>
            <div className="kpi" data-tone="low"><div className="kpi-label">低危</div><div className="kpi-value">{dist.low ?? 0}</div></div>
          </div>
          <div className="progress" style={{ marginBottom: 8 }}>
            <span style={{ width: `${((dist.green ?? 0) / total) * 100}%`, background: 'var(--green)' }} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>低危占比 {Math.round(((dist.green ?? 0) / total) * 100)}% · 培训前后平均风险 {stats.before_avg_risk ?? 0} → {stats.after_avg_risk ?? 0}</div>
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />重点关注学员</h3>
          {topStudents.length === 0 ? (
            <div className="empty"><div className="empty-icon">🎉</div><div className="empty-text">暂无高危学员</div></div>
          ) : (
            <div className="list">
              {topStudents.map((s) => (
                <div key={s.id} className="list-row">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.display_name || s.username}</span>
                  <span style={{ fontSize: 12, flexShrink: 0 }}>
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>{s.high_count} 高危</span>
                    <span className="muted"> · 待办 {s.pending_assignments}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <button className="btn-outline" style={{ width: '100%', marginTop: 14 }} onClick={() => navigate('/students')}>查看全部学员 →</button>
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />高频错误排行</h3>
          {topErrors.length === 0 ? (
            <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">暂无数据</div></div>
          ) : (
            <div className="list">
              {topErrors.slice(0, 6).map((h, i) => (
                <div key={i} className="list-row">
                  <span className="badge" style={{ flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{h.behavior}</span>
                  <span className="muted" style={{ fontSize: 13, flexShrink: 0 }}>{h.count} 次</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />教学快捷入口</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn" onClick={() => navigate('/teacher')}>🛠️ 教学创作台</button>
            <button className="btn" onClick={() => navigate('/assignments')}>📋 作业管理</button>
            <button className="btn" onClick={() => navigate('/students')}>👥 学员管理</button>
            <button className="btn" onClick={() => navigate('/admin')}>🗂️ 组织画像</button>
          </div>
        </div>
      </div>
    </div>
  )
}
