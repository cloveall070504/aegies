import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSystemInfo } from '../../api'
import useAuthStore from '../../store/authStore'

const ROLE_LABEL = { admin: '管理员', teacher: '教师', student: '学生' }

export default function AdminHome() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getSystemInfo().then(setInfo).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!info) return <div className="card"><div className="skeleton" style={{ height: 120 }} /></div>

  const counts = info.user_counts || {}

  return (
    <div>
      <h1 className="page-title">系统管理总览</h1>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          padding: '12px 16px', borderRadius: 14,
          background: 'linear-gradient(90deg, #f59e0b22, transparent)',
          border: '1px solid #f59e0b55',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#f59e0b', borderRadius: 999, padding: '5px 12px', whiteSpace: 'nowrap' }}>
          管理员视图
        </span>
        <span className="muted" style={{ fontSize: 13 }}>👨‍💼 {user?.display_name || user?.username}，系统运行状况与资源配置总览</span>
      </div>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="card stat-card">
          <div className="muted">用户总数</div>
          <div className="stat-num">{info.total_users}</div>
        </div>
        <div className="card stat-card">
          <div className="muted">场景数量</div>
          <div className="stat-num">{info.total_scenes}</div>
        </div>
        <div className="card stat-card">
          <div className="muted">题库题目</div>
          <div className="stat-num">{info.total_questions}</div>
        </div>
        <div className="card stat-card">
          <div className="muted">推演记录</div>
          <div className="stat-num">{info.total_records}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="section-title"><span className="dot" />用户角色分布</h3>
          {Object.keys(counts).length === 0 ? (
            <div className="empty"><div className="empty-icon">👥</div><div className="empty-text">暂无用户</div></div>
          ) : (
            Object.entries(counts).map(([role, n]) => (
              <div key={role} className="info-row">
                <span>{ROLE_LABEL[role] || role}</span>
                <span className="muted">{n} 人</span>
              </div>
            ))
          )}
          <button className="btn-outline" style={{ width: '100%', marginTop: 12 }} onClick={() => navigate('/admin')}>前往用户管理 →</button>
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />AI 引擎状态</h3>
          <div className="info-row">
            <span>Ollama 本地模型</span>
            <span style={{ color: info.enable_ollama ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
              {info.enable_ollama ? '● 已启用' : '○ 未启用（规则引擎）'}
            </span>
          </div>
          <div className="info-row"><span>模型名称</span><span className="muted">{info.ollama_model || '-'}</span></div>
          <div className="info-row"><span>服务地址</span><span className="muted">{info.ollama_base_url || '-'}</span></div>
          <div className="info-row"><span>运行环境</span><span className="muted">{info.app_env || 'dev'}</span></div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 className="section-title"><span className="dot" />管理快捷入口</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <button className="btn" onClick={() => navigate('/admin')}>🗂️ 管理后台</button>
            <button className="btn" onClick={() => navigate('/settings')}>⚙️ 系统设置</button>
            <button className="btn" onClick={() => navigate('/students')}>👥 学员管理</button>
            <button className="btn" onClick={() => navigate('/teacher')}>🛠️ 教学创作台</button>
          </div>
        </div>
      </div>
    </div>
  )
}
