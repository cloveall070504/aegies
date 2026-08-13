import { useEffect, useState } from 'react'
import { getDashboard } from '../../api/profile'
import useAuthStore from '../../store/authStore'

export default function MobileHome() {
  const { user } = useAuthStore()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message))
  }, [])

  const bar = data?.status_bar || {}

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          你好，{user?.display_name || user?.username}
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          {user?.role} · {user?.department} · 今日也请注意安全操作
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 12 }}>加载失败：{error}</div>}
      {!data && !error && <div className="muted">加载中…</div>}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <div className="card" style={{ textAlign: 'center', borderTop: '4px solid var(--red)' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{data.risk_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>风险数</div>
            </div>
            <div className="card" style={{ textAlign: 'center', borderTop: '4px solid var(--yellow)' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{data.avoided_count}</div>
              <div className="muted" style={{ fontSize: 12 }}>已规避</div>
            </div>
            <div className="card" style={{ textAlign: 'center', borderTop: '4px solid var(--green)' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{data.pass_rate}%</div>
              <div className="muted" style={{ fontSize: 12 }}>通过率</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <strong style={{ fontSize: 14 }}>红黄绿状态</strong>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red)' }}>{bar.red ?? 0}</div>
                <div className="muted" style={{ fontSize: 12 }}>高危</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 8, background: 'rgba(245,158,11,0.1)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--yellow)' }}>{bar.yellow ?? 0}</div>
                <div className="muted" style={{ fontSize: 12 }}>中危</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 8, background: 'rgba(16,185,129,0.1)' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{bar.green ?? 0}</div>
                <div className="muted" style={{ fontSize: 12 }}>低危</div>
              </div>
            </div>
          </div>

          <div className="card">
            <strong style={{ fontSize: 14 }}>高频错误</strong>
            {(data.hot_errors || []).length === 0 && <div className="muted" style={{ marginTop: 8 }}>暂无</div>}
            {(data.hot_errors || []).slice(0, 5).map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{h.behavior}</span>
                <span style={{ color: 'var(--primary)' }}>{h.count}次</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
