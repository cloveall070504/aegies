import { useEffect, useState } from 'react'
import { getPersonalProfile } from '../../api/profile'
import ScoreGauge from '../../components/ScoreGauge'

export default function MobileProfile() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getPersonalProfile().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!data) return <div className="muted">加载中…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ fontSize: 18, margin: 0 }}>个人避错画像</h2>
      <div className="card" style={{ textAlign: 'center' }}>
        <ScoreGauge score={data.pass_rate} size={130} />
        <div className="muted">达标率</div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="muted">累计推演记录</span>
          <strong>{data.total_records}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="muted">提升率</span>
          <strong style={{ color: 'var(--green)' }}>{data.improvement_rate}%</strong>
        </div>
      </div>
      <div className="card">
        <strong style={{ fontSize: 14 }}>高频易错项</strong>
        {(data.high_freq_errors || []).slice(0, 3).map((h, i) => (
          <div key={i} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            {h.description}
          </div>
        ))}
        {(data.high_freq_errors || []).length === 0 && <div className="muted" style={{ marginTop: 6 }}>暂无</div>}
      </div>
      <div className="card">
        <strong style={{ fontSize: 14 }}>提升建议</strong>
        <ul style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 0', paddingLeft: 18 }}>
          {(data.suggestions || []).slice(0, 3).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
