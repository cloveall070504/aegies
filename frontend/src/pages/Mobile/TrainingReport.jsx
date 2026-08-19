/** Mobile 单场景培训报告 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrainingReport, listScenes } from '../../api/scenes'
import RiskTag from '../../components/RiskTag'
import useSceneStore from '../../store/sceneStore'
import useThemeStore from '../../store/themeStore'

export default function MobileTrainingReport() {
  const { sceneCode } = useParams()
  const navigate = useNavigate()
  const setScenes = useSceneStore((s) => s.setScenes)
  const setCurrentScene = useSceneStore((s) => s.setCurrentScene)
  const refreshScenesIfStale = useSceneStore((s) => s.refreshScenesIfStale)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [r, scenes] = await Promise.all([
        getTrainingReport(sceneCode),
        refreshScenesIfStale(listScenes),
      ])
      const allowed = (scenes || []).filter((s) => s.builtin === 1 || s.category === 'experiment')
      setScenes(allowed)
      const matched = allowed.find((s) => s.scene_code === sceneCode)
      if (matched) { setCurrentScene(matched); useThemeStore.setState({ theme: matched.theme_name }) }
      setData(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [sceneCode])

  const scene = data?.scene || {}
  const preScore = data?.pre_score
  const postScore = data?.post_score
  const improvement = data?.improvement ?? 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn-outline chip-btn" onClick={() => navigate('/mobile/training')}>← 总览</button>
        <button className="btn-outline chip-btn" onClick={() => navigate(`/mobile/sim/${sceneCode}/sim`)}>🔁 练习</button>
        {preScore == null && (
          <button className="btn chip-btn" onClick={() => navigate(`/mobile/sim/${sceneCode}/pre`)}>🎯 预考</button>
        )}
        {preScore != null && (postScore == null || !data?.pass) && (
          <button className="btn chip-btn" onClick={() => navigate(`/mobile/sim/${sceneCode}/post`)}>📝 考核</button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>}

      {!loading && data && (
        <>
          <div className="card hero-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 40 }}>{scene.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{scene.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  练习 {data.sim_count || 0}次
                </div>
              </div>
              {data.pass
                ? <RiskTag level="low">✅ 通过</RiskTag>
                : <RiskTag level={postScore == null ? 'medium' : 'high'} style={{ fontSize: 12 }}>
                    {postScore == null ? '📋 未考核' : '❌ 未通过'}
                  </RiskTag>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
            <div className="card stat-card" data-level="medium" style={{ padding: 12, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10 }}>预考</div>
              <div className="stat-num" style={{ fontSize: 24 }}>{preScore != null ? preScore : '—'}</div>
            </div>
            <div className="card stat-card" style={{ padding: 12, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10 }}>考核</div>
              <div className="stat-num" style={{ fontSize: 24, color: postScore != null && postScore >= 60 ? 'var(--green)' : 'var(--red)' }}>
                {postScore != null ? postScore : '—'}
              </div>
            </div>
            <div className="card stat-card" data-level="low" style={{ padding: 12, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 10 }}>提升</div>
              <div className="stat-num" style={{ fontSize: 24, color: improvement >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {postScore != null ? (improvement >= 0 ? '+' : '') + improvement : '—'}
              </div>
            </div>
          </div>

          {(data.weakness_steps || []).length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 14 }}><span className="dot" />薄弱项</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.weakness_steps.map((w, i) => (
                  <div key={i} className="card alert-error" style={{ padding: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: 'var(--red)' }}>⚠</span>
                      <div style={{ flex: 1, fontSize: 13 }}><strong>{w.step_title}</strong></div>
                      <RiskTag level={w.risk_level || 'high'} style={{ fontSize: 11 }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="section-title" style={{ marginTop: 14 }}><span className="dot" />前后对比</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.pre_steps || []).map((pre, i) => {
              const post = (data.post_steps || [])[i]
              const gotBetter = post && pre && !pre.correct && post.correct
              return (
                <div key={i} className="card" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span className="step-badge">{i + 1}</span>
                    <strong style={{ fontSize: 13, flex: 1 }}>{pre.step_title}</strong>
                    {gotBetter && <RiskTag level="low" style={{ fontSize: 11 }}>进步🎉</RiskTag>}
                    {pre.risk_level && <RiskTag level={pre.risk_level} style={{ fontSize: 11 }} />}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="alert" style={{ background: 'var(--primary-bg)', padding: 8, fontSize: 12 }}>
                      <span className="muted" style={{ fontSize: 10 }}>预考 </span>
                      {pre.correct
                        ? <span style={{ color: 'var(--green)' }}>✓ {pre.choice_label || '作答'}</span>
                        : <span style={{ color: 'var(--red)' }}>✗ {pre.choice_label || '未作答'}</span>}
                      {!pre.correct && pre.consequence && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>→ {pre.consequence}</div>
                      )}
                    </div>
                    <div className="alert" style={{ background: post ? 'var(--primary-bg)' : 'var(--border)', padding: 8, fontSize: 12 }}>
                      <span className="muted" style={{ fontSize: 10 }}>考核 </span>
                      {post
                        ? (post.correct
                            ? <span style={{ color: 'var(--green)' }}>✓ {post.choice_label || '作答'}</span>
                            : <span style={{ color: 'var(--red)' }}>✗ {post.choice_label || '未作答'}</span>)
                        : <span className="muted">暂未考核</span>}
                      {post && !post.correct && post.consequence && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>→ {post.consequence}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {(data.pre_steps || []).length === 0 && (
              <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: 13 }}>暂无培训记录，开始预考吧</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
