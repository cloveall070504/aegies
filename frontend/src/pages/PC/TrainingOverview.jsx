import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RiskTag from '../../components/RiskTag'
import SceneSelector from '../../components/SceneSelector'
import { useSceneName } from '../../hooks/useSceneType'
import { useTrainingOverview } from '../../hooks/useTrainingOverview'
import Quiz from './Quiz'

const STAGE_LABEL = {
  idle: { text: '未开始', level: 'medium' },
  learning: { text: '学习中', level: 'medium' },
  done: { text: '已通过', level: 'low' },
}

/** 「培训进度」面板：原培训中心内容（预考 → 学习模拟 → 考核 闭环） */
function TrainProgress({ navigate, sceneName }) {
  const { data, loading, error, currentScene, currentSceneItem } = useTrainingOverview()
  const s = currentSceneItem

  return (
    <div>
      <SceneSelector compact />
      <div className="card hero-card" style={{ marginTop: 14, padding: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 48 }}>🎓</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="muted" style={{ fontSize: 13 }}>沉浸式培训总览</div>
            <h1 style={{ fontSize: 28, margin: '4px 0 0' }}>我的培训进度</h1>
            <div className="muted" style={{ marginTop: 4 }}>
              当前场景：{sceneName} · 完成「预考 → 学习模拟 → 正式考核」闭环
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: 'var(--primary)' }}>{s?.stage === 'done' ? '✓' : '…'}</div>
            <div className="muted">当前场景状态</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 14 }}>
        <div className="card stat-card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>预考分数</div>
          <div className="stat-num" style={{ fontSize: 28 }}>{s?.pre_score != null ? s.pre_score : '—'}</div>
        </div>
        <div className="card stat-card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>考核分数</div>
          <div className="stat-num" style={{ fontSize: 28, color: 'var(--green)' }}>{s?.post_score != null ? s.post_score : '—'}</div>
        </div>
        <div className="card stat-card" style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12 }}>提升分数</div>
          <div className="stat-num" style={{ fontSize: 28, color: 'var(--primary)' }}>{s?.improvement != null ? `+${s.improvement}` : '—'}</div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}

      <h3 className="section-title" style={{ marginTop: 20 }}><span className="dot" />当前场景培训（跟随全局切换）</h3>

      {loading && <div className="card"><div className="skeleton" style={{ height: 90 }} /></div>}

      {s && (
        <div className="card" style={{ padding: 14, cursor: 'pointer' }} onClick={() => navigate(`/training/${s.scene_code}`)}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 30 }}>{s.icon}</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 15 }}>{s.name}</strong>
                <RiskTag level={(STAGE_LABEL[s.stage] || STAGE_LABEL.idle).level}>{(STAGE_LABEL[s.stage] || STAGE_LABEL.idle).text}</RiskTag>
                {s.builtin && <span className="chip-btn" style={{ fontSize: 11, background: 'var(--primary-bg)' }}>内置</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.description || `蓝白实验主题 · ${s.category}`}</div>
              {s.sim_count > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>已练习 {s.sim_count} 次</div>}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: 11 }}>预考</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.pre_score != null ? (s.pre_score >= 60 ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>{s.pre_score != null ? s.pre_score : '—'}</div>
              </div>
              <div style={{ fontSize: 20, color: 'var(--muted)' }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div className="muted" style={{ fontSize: 11 }}>考核</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.post_score != null ? (s.post_score >= 60 ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>{s.post_score != null ? s.post_score : '—'}</div>
              </div>
              {s.improvement != null && s.improvement !== 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.improvement > 0 ? 'var(--green)' : 'var(--red)' }}>+{s.improvement}</div>
                  <div className="muted" style={{ fontSize: 10 }}>提升</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {s.stage !== 'done' && (
                <button className="btn chip-btn" onClick={(e) => { e.stopPropagation(); navigate(`/sim/${s.scene_code}/pre`) }}>🎯 开始培训</button>
              )}
              {s.stage === 'done' && (
                <button className="btn-outline chip-btn" onClick={(e) => { e.stopPropagation(); navigate(`/training/${s.scene_code}`) }}>📊 报告</button>
              )}
            </div>
          </div>
        </div>
      )}
      {data && !s && (
        <div className="card empty"><div className="empty-icon">🎓</div><div className="empty-text">当前场景暂无培训内容，请切换场景或联系管理员</div></div>
      )}
    </div>
  )
}

/** 学习中心（合并「培训中心」与「自测考试」），路由仍挂在 /training */
export default function TrainingOverview() {
  const navigate = useNavigate()
  const sceneName = useSceneName()
  const [tab, setTab] = useState('train')

  return (
    <div>
      <h1 className="page-title">学习中心</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={tab === 'train' ? 'btn' : 'btn-outline'} onClick={() => setTab('train')}>📊 培训进度</button>
        <button className={tab === 'quiz' ? 'btn' : 'btn-outline'} onClick={() => setTab('quiz')}>📝 自测考试</button>
      </div>
      {tab === 'train' ? (
        <TrainProgress navigate={navigate} sceneName={sceneName} />
      ) : (
        <Quiz />
      )}
    </div>
  )
}
