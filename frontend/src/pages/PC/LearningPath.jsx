import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHead from '../../components/PageHead'
import useAuthStore from '../../store/authStore'
import { getLearningOverview } from '../../api'

const LEVEL_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
const STATUS_META = {
  mastered: { text: '已掌握', color: '#10b981', bg: 'rgba(16,185,129,0.16)' },
  current: { text: '当前关卡', color: '#22d3ee', bg: 'rgba(34,211,238,0.16)' },
  locked: { text: '未解锁', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)' },
}

export default function LearningPath() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getLearningOverview()
      .then((d) => setData(d))
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>
  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>

  const recommended = data?.recommended || []
  const path = data?.path || []
  const stats = data?.stats || {}

  return (
    <div>
      <PageHead
        eyebrow="学习者专区"
        title="我的学习路径"
        desc={`${user?.display_name || user?.username}，基于你的错题与培训记录，为你定制精准练习路线`}
      />

      {/* 概览 */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi" data-tone="medium">
          <div className="kpi-top"><span className="kpi-icon">🎯</span><span className="kpi-label">本周推荐弱项</span></div>
          <div className="kpi-value">{stats.total_weak ?? 0}</div>
        </div>
        <div className="kpi" data-tone="low">
          <div className="kpi-top"><span className="kpi-icon">🧭</span><span className="kpi-label">学习进度</span></div>
          <div className="kpi-value" style={{ fontSize: 20, paddingTop: 8 }}>{stats.path_progress ?? '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon">📚</span><span className="kpi-label">已参与场景</span></div>
          <div className="kpi-value">{stats.engaged_scenes ?? 0}</div>
        </div>
      </div>

      {/* 本周推荐练习 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title"><span className="dot" />本周推荐练习（弱项 Top 3）</h3>
        {recommended.length === 0 ? (
          <div className="empty"><div className="empty-icon">🎯</div><div className="empty-text">暂无推荐，先去「培训」模块做几道自测题吧</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recommended.map((rp, i) => (
              <div key={rp.risk_point_id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'var(--card-2, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <div style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--primary-bg)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge" style={{ background: LEVEL_COLOR[rp.level] + '22', color: LEVEL_COLOR[rp.level], border: `1px solid ${LEVEL_COLOR[rp.level]}` }}>{rp.level === 'high' ? '高危' : rp.level === 'medium' ? '中危' : '低危'}</span>
                    <strong style={{ fontSize: 14 }}>{rp.description}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{rp.reason} · {rp.scene_name}</div>
                </div>
                <button className="btn chip-btn" style={{ flexShrink: 0 }} onClick={() => navigate('/training')}>去练习 →</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 闯关式学习路径 */}
      <div className="card">
        <h3 className="section-title"><span className="dot" />闯关式学习路径</h3>
        {path.length === 0 ? (
          <div className="empty"><div className="empty-icon">🧭</div><div className="empty-text">还没有学习记录，去「培训」模块开始你的第一个场景培训</div></div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            <div style={{ position: 'absolute', left: 10, top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
            {path.map((lv, i) => {
              const sm = STATUS_META[lv.status] || STATUS_META.locked
              return (
                <div key={lv.scene_code} style={{ position: 'relative', marginBottom: 16 }}>
                  <div style={{ position: 'absolute', left: -22, top: 4, width: 16, height: 16, borderRadius: 999, background: sm.color, boxShadow: '0 0 0 4px var(--bg)' }} />
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>第 {i + 1} 关 · {lv.scene_name}</strong>
                    <span className="badge" style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.color}` }}>{sm.text}</span>
                    <span className="muted" style={{ fontSize: 12 }}>掌握度 {lv.mastery}%</span>
                    {lv.status !== 'locked' && (
                      <button className="btn-outline chip-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/training/${lv.scene_code}`)}>进入本关 →</button>
                    )}
                  </div>
                  {/* 掌握度条 */}
                  <div style={{ height: 7, borderRadius: 999, background: 'var(--border)', marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${lv.mastery}%`, background: lv.mastery >= 70 ? 'var(--green)' : lv.mastery >= 40 ? 'var(--primary)' : 'var(--red)' }} />
                  </div>
                  {/* 本关风险点 */}
                  {lv.risk_points?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {lv.risk_points.map((rp) => (
                        <span key={rp.id} className="badge" style={{ background: LEVEL_COLOR[rp.level] + '22', color: LEVEL_COLOR[rp.level], border: `1px solid ${LEVEL_COLOR[rp.level]}` }}>
                          {rp.description}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
