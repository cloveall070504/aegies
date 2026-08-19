import { useState } from 'react'
import { generateReport, downloadReport } from '../../api'
import ScoreGauge from '../../components/ScoreGauge'
import RiskTrendChart from '../../components/RiskTrendChart'
import { useSceneName } from '../../hooks/useSceneType'
import { useProfile } from '../../hooks/useProfile'

export default function MobileProfile() {
  const sceneName = useSceneName()
  const { data, loadError, actionError, setActionError } = useProfile()
  const [generating, setGenerating] = useState(false)

  const exportReport = async () => {
    setGenerating(true)
    setActionError('')
    try {
      const r = await generateReport('personal', '')
      const blob = await downloadReport(r.report_id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `避错提升报告_${new Date().toLocaleDateString()}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loadError) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{loadError}</div>
  if (!data) return <div className="card"><div className="skeleton" style={{ height: 100 }} /></div>

  const dist = data.risk_distribution || {}
  const trend = data.trend || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>个人避错画像</h2>
        <button className="btn-outline chip-btn" onClick={exportReport} disabled={generating}>
          {generating ? <><span className="spinner" /> 生成中</> : '📑 导出报告'}
        </button>
      </div>
      <div className="badge">当前场景：{sceneName} · {data.total_records} 条记录</div>
      {actionError && <div className="alert alert-error">{actionError}</div>}
      <div className="card" style={{ textAlign: 'center' }}>
        <ScoreGauge score={data.pass_rate} size={130} />
        <div className="muted">达标率</div>
      </div>
      <div className="card">
        <div className="info-row">
          <span className="muted">累计推演记录</span>
          <strong>{data.total_records}</strong>
        </div>
        <div className="info-row">
          <span className="muted">提升率</span>
          <strong style={{ color: 'var(--green)' }}>{data.improvement_rate}%</strong>
        </div>
      </div>
      <div className="card">
        <h3 className="section-title"><span className="dot" />风险分布</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: 'rgba(239,68,68,0.12)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red)' }}>{dist.high ?? 0}</div>
            <div className="muted" style={{ fontSize: 12 }}>高危</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: 'rgba(245,158,11,0.12)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--yellow)' }}>{dist.medium ?? 0}</div>
            <div className="muted" style={{ fontSize: 12 }}>中危</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: 10, borderRadius: 10, background: 'rgba(16,185,129,0.12)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{dist.low ?? 0}</div>
            <div className="muted" style={{ fontSize: 12 }}>低危</div>
          </div>
        </div>
      </div>
      {trend.length > 0 && (
        <div className="card">
          <h3 className="section-title"><span className="dot" />风险趋势</h3>
          <RiskTrendChart data={trend} titleSuffix="推演" />
        </div>
      )}
      <div className="card">
        <h3 className="section-title"><span className="dot" />高频易错项</h3>
        {(data.high_freq_errors || []).slice(0, 3).map((h, i) => (
          <div key={i} className="info-row" style={{ fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{h.behavior || h.description}</span>
            <span className="muted">{h.count}次</span>
          </div>
        ))}
        {(data.high_freq_errors || []).length === 0 && <div className="muted" style={{ marginTop: 6 }}>暂无</div>}
      </div>
      <div className="card">
        <h3 className="section-title"><span className="dot" />提升建议</h3>
        <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          {(data.suggestions || []).slice(0, 3).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
          {(data.suggestions || []).length === 0 && <li className="muted">暂无建议</li>}
        </ul>
      </div>
    </div>
  )
}
