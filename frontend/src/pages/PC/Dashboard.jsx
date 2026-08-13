import { useEffect, useState } from 'react'
import { getDashboard } from '../../api/profile'
import RiskCard from '../../components/RiskCard'
import ScoreGauge from '../../components/ScoreGauge'
import { formatTime } from '../../utils/format'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!data) return <div className="muted">加载中…</div>

  const bar = data.status_bar || {}

  return (
    <div>
      <h1 className="page-title">动态风险驾驶舱</h1>

      {/* 红黄绿状态条 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        <div className="card" style={{ borderTop: '4px solid var(--red)' }}>
          <div className="muted">风险数量</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{data.risk_count}</div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--yellow)' }}>
          <div className="muted">已规避数量</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{data.avoided_count}</div>
        </div>
        <div className="card" style={{ borderTop: '4px solid var(--green)' }}>
          <div className="muted">自测通过率</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{data.pass_rate}%</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>红黄绿分布</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{bar.red ?? 0}</div>
              <div className="muted">高危</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'rgba(245,158,11,0.1)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--yellow)' }}>{bar.yellow ?? 0}</div>
              <div className="muted">中危</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'rgba(16,185,129,0.1)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{bar.green ?? 0}</div>
              <div className="muted">低危</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <ScoreGauge score={Math.min(100, (data.avoided_count || 0) * 20)} size={120} />
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>高频错误滚动</h3>
          {(data.hot_errors || []).length === 0 && <div className="muted">暂无高频错误</div>}
          {(data.hot_errors || []).map((h, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{h.behavior}</span>
              <span style={{ fontSize: 13, color: 'var(--primary)' }}>{h.count} 次</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>最近推演记录</h3>
          {(data.recent_records || []).length === 0 && <div className="muted">暂无记录，去试试场景推演</div>}
          {(data.recent_records || []).map((r) => (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14 }}>{r.behavior}</div>
              <div className="muted" style={{ fontSize: 12 }}>风险 {r.risk_score} 分 · {formatTime(r.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
