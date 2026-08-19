/** PC 单场景培训报告：预考 vs 考核 前后对比 + 薄弱步骤 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTrainingReport, listScenes } from '../../api/scenes'
import SceneSelector from '../../components/SceneSelector'
import RiskTag from '../../components/RiskTag'
import useSceneStore from '../../store/sceneStore'
import useThemeStore from '../../store/themeStore'
import { isAllowedScene } from '../../utils/sceneFilter'

export default function TrainingReport() {
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
      const allowed = (scenes || []).filter(isAllowedScene)
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

  const fmtTime = (t) => {
    if (!t) return '—'
    try { return new Date(t).toLocaleString('zh-CN') } catch { return t }
  }

  return (
    <div>
      <SceneSelector />

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-outline chip-btn" onClick={() => navigate('/training')}>← 返回培训总览</button>
        <button className="btn-outline chip-btn" onClick={() => navigate(`/sim/${sceneCode}/sim`)}>🔁 继续练习</button>
        {preScore == null && (
          <button className="btn chip-btn" onClick={() => navigate(`/sim/${sceneCode}/pre`)}>🎯 先做预考</button>
        )}
        {preScore != null && (postScore == null || !data?.pass) && (
          <button className="btn chip-btn" onClick={() => navigate(`/sim/${sceneCode}/post`)}>📝 参加考核</button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

      {loading && (
        <div style={{ marginTop: 14 }}>
          <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Hero：基本信息 + 通过徽章 */}
          <div className="card hero-card" style={{ marginTop: 14, padding: 20 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 48 }}>{scene.icon}</div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="muted" style={{ fontSize: 13 }}>培训报告</div>
                <h1 style={{ fontSize: 26, margin: '4px 0 0' }}>{scene.name}</h1>
                <div className="muted" style={{ marginTop: 4 }}>
                  练习次数：{data.sim_count || 0} · 预考时间：{fmtTime(data.pre_at)} · 考核时间：{fmtTime(data.post_at)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                {data.pass ? (
                  <RiskTag level="low" style={{ padding: '8px 14px', fontSize: 16 }}>✅ 已通过培训</RiskTag>
                ) : (
                  <RiskTag level={postScore == null ? 'medium' : 'high'} style={{ padding: '8px 14px', fontSize: 16 }}>
                    {postScore == null ? '📋 未考核' : '❌ 未通过，请继续学习'}
                  </RiskTag>
                )}
              </div>
            </div>
          </div>

          {/* 前后分对比大卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
            <div className="card stat-card" data-level="medium" style={{ padding: 18, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>预考得分</div>
              <div className="stat-num" style={{ fontSize: 40 }}>{preScore != null ? preScore : '—'}</div>
              <div className="muted" style={{ fontSize: 11 }}>培训前基线水平</div>
            </div>
            <div className="card stat-card" style={{ padding: 18, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>考核得分</div>
              <div className="stat-num" style={{ fontSize: 40, color: postScore != null && postScore >= 60 ? 'var(--green)' : 'var(--red)' }}>
                {postScore != null ? postScore : '—'}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>培训后正式成绩（≥60 合格）</div>
            </div>
            <div className="card stat-card" data-level="low" style={{ padding: 18, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 12 }}>能力提升</div>
              <div className="stat-num" style={{ fontSize: 40, color: improvement >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {postScore != null ? (improvement >= 0 ? '+' : '') + improvement : '—'}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                {improvement > 0 ? '学习效果明显 ✨' : improvement < 0 ? '需要加强练习' : '需完成考核'}
              </div>
            </div>
          </div>

          {/* 薄弱步骤高亮 */}
          {(data.weakness_steps || []).length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 20 }}><span className="dot" />薄弱项（考核中答错的步骤）</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.weakness_steps.map((w, i) => (
                  <div key={i} className="card alert-error" style={{ padding: 12 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span className="step-badge error" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>⚠</span>
                      <div style={{ flex: 1 }}>
                        <strong>{w.step_title}</strong>
                        <div className="muted" style={{ fontSize: 12 }}>建议回到模拟中重点练习</div>
                      </div>
                      <RiskTag level={w.risk_level || 'high'} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 前后逐步详解对比 */}
          <h3 className="section-title" style={{ marginTop: 20 }}><span className="dot" />前后对比详解</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(data.pre_steps || []).map((pre, i) => {
              const post = (data.post_steps || [])[i]
              const gotBetter = post && pre && !pre.correct && post.correct
              const gotWorse = post && pre && pre.correct && !post.correct
              return (
                <div key={i} className="card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                    <span className="step-badge">{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <strong>{pre.step_title}</strong>
                        {gotBetter && <RiskTag level="low">进步了 🎉</RiskTag>}
                        {gotWorse && <RiskTag level="high">退步了</RiskTag>}
                      </div>
                      {pre.risk_level && <RiskTag level={pre.risk_level} style={{ marginTop: 4 }} />}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="alert" style={{ background: 'var(--primary-bg)' }}>
                      <div className="muted" style={{ fontSize: 12 }}>预考答案</div>
                      <div style={{ marginTop: 4 }}>
                        {pre.correct
                          ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {pre.choice_label || '作答'}</span>
                          : <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {pre.choice_label || '未作答'}</span>}
                      </div>
                      {!pre.correct && pre.consequence && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>后果：{pre.consequence}</div>
                      )}
                    </div>
                    <div className="alert" style={{ background: post ? 'var(--primary-bg)' : 'var(--border)' }}>
                      <div className="muted" style={{ fontSize: 12 }}>考核答案</div>
                      {post ? (
                        <div style={{ marginTop: 4 }}>
                          {post.correct
                            ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ {post.choice_label || '作答'}</span>
                            : <span style={{ color: 'var(--red)', fontWeight: 700 }}>✗ {post.choice_label || '未作答'}</span>}
                        </div>
                      ) : (
                        <div className="muted" style={{ marginTop: 4 }}>暂未考核</div>
                      )}
                      {post && !post.correct && post.consequence && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>后果：{post.consequence}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {(data.pre_steps || []).length === 0 && (
              <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                <div className="muted">还没有预考和考核记录，点击顶部「先做预考」开始吧。</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
