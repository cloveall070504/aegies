import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import { useDashboard } from '../../hooks/useDashboard'

export default function MobileHome() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { data, error } = useDashboard()

  const bar = data?.status_bar || {}

  return (
    <div>
      <div className="hero" style={{ marginBottom: 14 }}>
        <div className="hero-title">你好，{user?.display_name || user?.username} 👋</div>
        <div className="hero-sub">{user?.role} · {user?.department} · 今日也请注意安全操作</div>
      </div>

      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 12 }}>加载失败：{error}</div>}
      {!data && !error && <div className="card"><div className="skeleton" style={{ height: 80 }} /></div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <div className="card stat-card" data-level="high" style={{ padding: 12, textAlign: 'center' }}>
              <div className="stat-num" style={{ fontSize: 22 }}>{data.risk_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>风险数</div>
            </div>
            <div className="card stat-card" data-level="medium" style={{ padding: 12, textAlign: 'center' }}>
              <div className="stat-num" style={{ fontSize: 22 }}>{data.avoided_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>已规避</div>
            </div>
            <div className="card stat-card" data-level="low" style={{ padding: 12, textAlign: 'center' }}>
              <div className="stat-num" style={{ fontSize: 22 }}>{data.pass_rate}%</div>
              <div className="muted" style={{ fontSize: 12 }}>通过率</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3 className="section-title"><span className="dot" />红黄绿状态</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: 'rgba(239,68,68,0.12)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red)' }}>{bar.red ?? 0}</div>
                <div className="muted" style={{ fontSize: 12 }}>高危</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: 'rgba(245,158,11,0.12)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--yellow)' }}>{bar.yellow ?? 0}</div>
                <div className="muted" style={{ fontSize: 12 }}>中危</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: 'rgba(16,185,129,0.12)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{bar.green ?? 0}</div>
                <div className="muted" style={{ fontSize: 12 }}>低危</div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title"><span className="dot" />高频错误</h3>
            {(data.hot_errors || []).length === 0 ? (
              <div className="muted" style={{ marginTop: 8 }}>暂无</div>
            ) : (
              (data.hot_errors || []).slice(0, 5).map((h, i) => (
                <div key={i} className="info-row" style={{ fontSize: 13 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{h.behavior}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{h.count}次</span>
                </div>
              ))
            )}
          </div>

          <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', marginTop: 14 }} onClick={() => navigate('/mobile/docs')}>
            <span className="step-badge">📄</span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 14 }}>文档上传与知识库</strong>
              <div className="muted" style={{ fontSize: 12 }}>上传规范文档，AI 自动抽取风险点</div>
            </div>
            <span style={{ color: 'var(--primary)' }}>›</span>
          </div>
        </>
      )}
    </div>
  )
}
