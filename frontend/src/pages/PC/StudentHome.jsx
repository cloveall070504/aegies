import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ScoreGauge from '../../components/ScoreGauge'
import PageHead from '../../components/PageHead'
import { useSceneName } from '../../hooks/useSceneType'
import { useDashboard } from '../../hooks/useDashboard'
import { listAssignments, asList, getReviewDue, getLearningOverview } from '../../api'
import useAuthStore from '../../store/authStore'

const LEVEL_META = {
  high: { label: '高危', color: 'var(--red)', bg: 'var(--red-bg, rgba(239,68,68,0.16))', border: 'var(--red)' },
  medium: { label: '中危', color: '#f59e0b', bg: 'rgba(245,158,11,0.16)', border: '#f59e0b' },
  low: { label: '低危', color: '#22c55e', bg: 'rgba(34,197,94,0.16)', border: '#22c55e' },
}

export default function StudentHome() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const sceneName = useSceneName()
  const { data, error } = useDashboard()
  const [pending, setPending] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [recommended, setRecommended] = useState([])

  useEffect(() => {
    listAssignments('active')
      .then((d) => {
        const mine = asList(d).filter((a) => a.my_status !== 'completed')
        setPending(mine.length)
      })
      .catch(() => setPending(0))
  }, [])

  useEffect(() => {
    getReviewDue()
      .then((d) => setDueCount(d?.count || 0))
      .catch(() => setDueCount(0))
  }, [])

  useEffect(() => {
    getLearningOverview()
      .then((d) => setRecommended((d?.recommended || []).slice(0, 3)))
      .catch(() => setRecommended([]))
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!data) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>

  const bar = data.status_bar || {}

  return (
    <div>
      <PageHead
        eyebrow="学习者专区"
        title="我的学习主页"
        desc={`${user?.display_name || user?.username}，欢迎回到实训课堂 · 当前场景：${sceneName}`}
      />

      {/* 待办作业提醒 */}
      {pending > 0 && (
        <div
          className="alert alert-warning"
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
          onClick={() => navigate('/assignments')}
        >
          <span style={{ fontSize: 22 }}>📋</span>
          <div style={{ flex: 1 }}>
            <strong>你有 {pending} 项作业待完成</strong>
            <div style={{ fontSize: 12, opacity: 0.85 }}>点击前往「我的作业」查看并提交</div>
          </div>
          <span className="badge">去完成 →</span>
        </div>
      )}

      {/* 待复习提醒（间隔重复） */}
      {dueCount > 0 && (
        <div
          className="alert alert-error"
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginTop: 12 }}
          onClick={() => navigate('/notifications')}
        >
          <span style={{ fontSize: 22 }}>🔁</span>
          <div style={{ flex: 1 }}>
            <strong>你有 {dueCount} 道错题待复习</strong>
            <div style={{ fontSize: 12, opacity: 0.85 }}>间隔复习能显著降低遗忘，点击前往巩固</div>
          </div>
          <span className="badge">去复习 →</span>
        </div>
      )}

      {/* 个性化弱项提醒（来自学习中心推荐） */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />你的个性化弱项</h3>
          <button className="btn-outline chip-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate('/learning')}>查看学习路径 →</button>
        </div>
        {recommended.length === 0 ? (
          <div className="empty" style={{ padding: '18px 0' }}><div className="empty-icon">🌟</div><div className="empty-text">暂无弱项提醒，保持得很好！</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {recommended.map((rp) => {
              const m = LEVEL_META[rp.level] || LEVEL_META.low
              return (
                <div
                  key={rp.risk_point_id}
                  onClick={() => navigate('/learning')}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'var(--card-2, rgba(255,255,255,0.03))', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, color: m.color, background: m.bg, border: `1px solid ${m.border}`, flexShrink: 0, marginTop: 2 }}>{m.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14 }}>{rp.description}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{rp.reason}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 核心指标 */}
      <div className="kpi-grid">
        <div className="kpi" data-tone="low">
          <div className="kpi-top"><span className="kpi-icon">✅</span><span className="kpi-label">自测通过率</span></div>
          <div className="kpi-value">{data.pass_rate}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon">🧪</span><span className="kpi-label">已推演次数</span></div>
          <div className="kpi-value">{data.total_records}</div>
        </div>
        <div className="kpi" data-tone="low">
          <div className="kpi-top"><span className="kpi-icon">🛡️</span><span className="kpi-label">已规避风险</span></div>
          <div className="kpi-value">{data.avoided_count}</div>
        </div>
      </div>

      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="card">
          <h3 className="section-title"><span className="dot" />我的风险分布</h3>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <div className="kpi" data-tone="high"><div className="kpi-label">高危</div><div className="kpi-value">{bar.red ?? 0}</div></div>
            <div className="kpi" data-tone="medium"><div className="kpi-label">中危</div><div className="kpi-value">{bar.yellow ?? 0}</div></div>
            <div className="kpi" data-tone="low"><div className="kpi-label">低危</div><div className="kpi-value">{bar.green ?? 0}</div></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ScoreGauge score={Math.min(100, (data.avoided_count || 0) * 20)} size={120} />
          </div>
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />最近推演记录</h3>
          {(data.recent_records || []).length === 0 ? (
            <div className="empty"><div className="empty-icon">🧪</div><div className="empty-text">暂无记录，去试试场景推演</div></div>
          ) : (
            <div className="list">
              {(data.recent_records || []).map((r) => (
                <div key={r.id} className="list-row">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.behavior}</span>
                  <span className="tag">{r.risk_score} 分</span>
                </div>
              ))}
            </div>
          )}
          <button className="btn-outline" style={{ width: '100%', marginTop: 14 }} onClick={() => navigate('/sandbox')}>＋ 新一次推演</button>
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />高频易错行为</h3>
          {(data.hot_errors || []).length === 0 ? (
            <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">暂无高频错误</div></div>
          ) : (
            <div className="list">
              {(data.hot_errors || []).map((h, i) => (
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
          <h3 className="section-title"><span className="dot" />快捷入口</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button className="btn" onClick={() => navigate('/training')}>🎓 学习中心</button>
            <button className="btn" onClick={() => navigate('/learning')}>🧭 学习路径</button>
            <button className="btn" onClick={() => navigate('/cases')}>📚 案例库</button>
            <button className="btn" onClick={() => navigate('/profile')}>👤 个人画像</button>
          </div>
        </div>
      </div>
    </div>
  )
}
