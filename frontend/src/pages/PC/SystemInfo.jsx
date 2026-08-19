import { useEffect, useState } from 'react'
import { getSystemInfo } from '../../api'

export default function SystemInfo() {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { getSystemInfo().then(setInfo).catch((e) => setError(e.message)) }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!info) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>

  const rc = info.user_counts || {}
  const roles = [['admin', '管理员'], ['teacher', '教师'], ['student', '学生']]
  const rk = info.risk_keywords || {}

  return (
    <div>
      <h1 className="page-title">系统信息</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b55' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#f59e0b', borderRadius: 999, padding: '4px 10px' }}>管理视角</span>
        <span className="muted" style={{ fontSize: 13 }}>平台运行总览与 AI 引擎配置，保障教学闭环稳定运行</span>
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="card stat-card"><div className="muted">用户总数</div><div className="stat-num">{info.total_users ?? 0}</div></div>
        <div className="card stat-card"><div className="muted">推演记录</div><div className="stat-num">{info.total_records ?? 0}</div></div>
        <div className="card stat-card"><div className="muted">场景数</div><div className="stat-num">{info.total_scenes ?? 0}</div></div>
        <div className="card stat-card"><div className="muted">题库数</div><div className="stat-num">{info.total_questions ?? 0}</div></div>
        <div className="card stat-card"><div className="muted">作业记录</div><div className="stat-num">{info.total_assignments ?? 0}</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="section-title"><span className="dot" />用户角色分布</h3>
          {roles.map(([k, l]) => (
            <div className="info-row" key={k}><span>{l}</span><span className="muted">{rc[k] ?? 0} 人</span></div>
          ))}
        </div>
        <div className="card">
          <h3 className="section-title"><span className="dot" />AI 引擎配置</h3>
          <div className="info-row"><span>Ollama 启用</span><span className="muted">{info.enable_ollama ? '是' : '否'}</span></div>
          <div className="info-row"><span>模型</span><span className="muted">{info.ollama_model || '-'}</span></div>
          <div className="info-row"><span>服务地址</span><span className="muted" style={{ maxWidth: '60%', textAlign: 'right' }}>{info.ollama_base_url || '-'}</span></div>
          <div className="info-row"><span>运行环境</span><span className="muted">{info.app_env || 'dev'}</span></div>
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 className="section-title"><span className="dot" />风险判定关键词</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(rk.high || []).map((k, i) => <span key={'h' + i} className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--red)' }}>{k}</span>)}
            {(rk.medium || []).map((k, i) => <span key={'m' + i} className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--yellow)' }}>{k}</span>)}
            {(rk.low || []).map((k, i) => <span key={'l' + i} className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green)' }}>{k}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}
