import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RiskTag from '../../components/RiskTag'
import { useSceneName } from '../../hooks/useSceneType'
import { useTrainingOverview } from '../../hooks/useTrainingOverview'
import MobileQuiz from './Quiz'

const STAGE_LABEL = {
  idle: { text: '未开始', level: 'medium' },
  learning: { text: '学习中', level: 'medium' },
  done: { text: '已通过', level: 'low' },
}

/** 「培训进度」面板：原培训中心内容 */
function TrainProgress({ navigate }) {
  const { data, loading, error, currentSceneItem } = useTrainingOverview()
  const s = currentSceneItem

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        <div className="card stat-card" style={{ padding: 10, textAlign: 'center' }}>
          <div className="stat-num" style={{ fontSize: 18 }}>{s?.pre_score != null ? s.pre_score : '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>预考</div>
        </div>
        <div className="card stat-card" style={{ padding: 10, textAlign: 'center' }}>
          <div className="stat-num" style={{ fontSize: 18, color: 'var(--green)' }}>{s?.post_score != null ? s.post_score : '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>考核</div>
        </div>
        <div className="card stat-card" style={{ padding: 10, textAlign: 'center' }}>
          <div className="stat-num" style={{ fontSize: 18, color: 'var(--primary)' }}>{s?.improvement != null ? `+${s.improvement}` : '—'}</div>
          <div className="muted" style={{ fontSize: 11 }}>提升</div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="card"><div className="skeleton" style={{ height: 80 }} /></div>}

      {s && (
        <div className="card" style={{ padding: 12 }} onClick={() => navigate(`/mobile/training/${s.scene_code}`)}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 28 }}>{s.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>{s.name}</strong>
                <RiskTag level={(STAGE_LABEL[s.stage] || STAGE_LABEL.idle).level} style={{ fontSize: 11 }}>{(STAGE_LABEL[s.stage] || STAGE_LABEL.idle).text}</RiskTag>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {s.description || s.category} · 练习 {s.sim_count || 0}次
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12 }}>
                <span>预考 <strong style={{ color: s.pre_score != null ? (s.pre_score >= 60 ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>{s.pre_score != null ? s.pre_score : '—'}</strong></span>
                <span>→</span>
                <span>考核 <strong style={{ color: s.post_score != null ? (s.post_score >= 60 ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>{s.post_score != null ? s.post_score : '—'}</strong></span>
                {s.improvement != null && s.improvement !== 0 && (
                  <strong style={{ color: s.improvement > 0 ? 'var(--green)' : 'var(--red)' }}>+{s.improvement}</strong>
                )}
              </div>
            </div>
            <span style={{ color: 'var(--primary)' }}>›</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {s.stage !== 'done' ? (
              <button className="btn chip-btn" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); navigate(`/mobile/sim/${s.scene_code}/pre`) }}>🎯 开始培训</button>
            ) : (
              <button className="btn-outline chip-btn" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); navigate(`/mobile/sim/${s.scene_code}/sim`) }}>🔁 继续练习</button>
            )}
          </div>
        </div>
      )}
      {data && !s && (
        <div className="card empty"><div className="empty-icon">🎓</div><div className="empty-text">当前场景暂无培训内容，请切换场景或联系管理员</div></div>
      )}
    </div>
  )
}

/** 学习中心（合并「培训中心」与「自测考试」），路由挂在 /mobile/training */
export default function MobileTrainingOverview() {
  const navigate = useNavigate()
  const sceneName = useSceneName()
  const [tab, setTab] = useState('train')

  return (
    <div>
      <div className="hero">
        <div className="hero-title">🎓 学习中心</div>
        <div className="hero-sub">当前场景：{sceneName} · 培训 + 自测一站式</div>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button className={tab === 'train' ? 'btn' : 'btn-outline'} style={{ flex: 1, fontSize: 13 }} onClick={() => setTab('train')}>📊 培训进度</button>
        <button className={tab === 'quiz' ? 'btn' : 'btn-outline'} style={{ flex: 1, fontSize: 13 }} onClick={() => setTab('quiz')}>📝 自测考试</button>
      </div>
      {tab === 'train' ? <TrainProgress navigate={navigate} /> : <MobileQuiz />}
    </div>
  )
}
