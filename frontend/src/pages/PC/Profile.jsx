import { useEffect, useState } from 'react'
import { getPersonalProfile } from '../../api/profile'
import ScoreGauge from '../../components/ScoreGauge'
import RiskCard from '../../components/RiskCard'
import { formatTime } from '../../utils/format'

export default function Profile() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getPersonalProfile().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!data) return <div className="muted">加载中…</div>

  const highFreq = data.high_freq_errors || []
  const weaknesses = data.weaknesses || []

  return (
    <div>
      <h1 className="page-title">个人避错成长画像</h1>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <ScoreGauge score={data.pass_rate} size={130} />
          <div className="muted">自测/避错达标率</div>
        </div>
        <div className="card">
          <div className="muted">累计推演记录</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{data.total_records}</div>
          <div className="muted" style={{ marginTop: 8 }}>风险识别能力提升率</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>{data.improvement_rate}%</div>
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 8px' }}>提升建议</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 14 }}>
            {(data.suggestions || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>高频易错项</h3>
          {highFreq.length === 0 && <div className="muted">暂无数据</div>}
          {highFreq.map((h, i) => (
            <RiskCard key={i} item={h} />
          ))}
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>薄弱点（按场景）</h3>
          {weaknesses.length === 0 && <div className="muted">暂无数据</div>}
          {weaknesses.map((w, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 14 }}>{w.scene}</strong>
                <span style={{ color: w.count >= 3 ? 'var(--red)' : 'var(--yellow)' }}>{w.count} 次</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.recent_records?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px' }}>最近记录</h3>
          {data.recent_records.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{r.behavior}</span>
              <span className="muted">{r.risk_score} 分 · {formatTime(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
