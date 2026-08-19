import { useState } from 'react'
import { generateReport, downloadReport } from '../../api'
import ScoreGauge from '../../components/ScoreGauge'
import RiskCard from '../../components/RiskCard'
import PageHead from '../../components/PageHead'
import RiskTrendChart from '../../components/RiskTrendChart'
import { formatTime } from '../../utils/format'
import { useSceneName } from '../../hooks/useSceneType'
import { useProfile } from '../../hooks/useProfile'

export default function Profile() {
  const sceneName = useSceneName()
  const { data, loadError, actionError, setActionError, reload } = useProfile()
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
  const highFreq = data.high_freq_errors || []
  const weaknesses = data.weaknesses || []
  const trend = data.trend || []

  return (
    <div>
      <PageHead
        eyebrow="学习者专区"
        title="个人避错成长画像"
        desc={`当前场景：${sceneName} · ${data.total_records} 条记录`}
        actions={<button className="btn-outline" onClick={exportReport} disabled={generating}>
          {generating ? <><span className="spinner" /> 生成中…</> : '📑 导出提升报告'}
        </button>}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="badge">当前场景：{sceneName} · {data.total_records} 条记录</span>
      </div>

      {actionError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{actionError}</div>}

      <div className="hero">
        <div className="hero-title">一人一档 · 能力提升闭环</div>
        <div className="hero-sub">自动统计自查、自测、推演记录，生成专属避错提升报告</div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <ScoreGauge score={data.pass_rate} size={130} />
          <div className="muted">自测/避错达标率</div>
        </div>
        <div className="card stat-card" data-level="medium">
          <div className="muted">累计推演记录</div>
          <div className="stat-num">{data.total_records}</div>
        </div>
        <div className="card stat-card" data-level="low">
          <div className="muted">风险识别能力提升率</div>
          <div className="stat-num" style={{ color: 'var(--green)' }}>{data.improvement_rate}%</div>
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />提升建议</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14 }}>
            {(data.suggestions || []).length === 0 && <li className="muted">暂无建议，继续完成推演与自测</li>}
            {(data.suggestions || []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="section-title"><span className="dot" />风险趋势</h3>
          {trend.length === 0 ? (
            <div className="empty"><div className="empty-icon">📈</div><div className="empty-text">暂无趋势数据</div></div>
          ) : (
            <RiskTrendChart data={trend} titleSuffix="推演" />
          )}
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />风险分布</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.12)' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{dist.high ?? 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>高危</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.12)' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--yellow)' }}>{dist.medium ?? 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>中危</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.12)' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{dist.low ?? 0}</div>
              <div className="muted" style={{ fontSize: 12 }}>低危</div>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />高频易错项</h3>
          {highFreq.length === 0 ? (
            <div className="empty"><div className="empty-icon">🎯</div><div className="empty-text">暂无数据</div></div>
          ) : (
            highFreq.map((h, i) => <RiskCard key={i} item={h} />)
          )}
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />薄弱点（按场景）</h3>
          {weaknesses.length === 0 ? (
            <div className="empty"><div className="empty-icon">📊</div><div className="empty-text">暂无数据</div></div>
          ) : (
            weaknesses.map((w, i) => (
              <div key={i} className="rank-row">
                <strong className="rank-text">{w.scene_type}</strong>
                <span className="rank-count" style={{ color: w.avg_score >= 60 ? 'var(--red)' : 'var(--yellow)' }}>均分 {w.avg_score}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {data.recent_records?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="section-title"><span className="dot" />最近记录</h3>
          {data.recent_records.map((r) => (
            <div key={r.id} className="info-row">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{r.behavior}</span>
              <span className="muted">{r.risk_score} 分 · {formatTime(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
