import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../api/auth'
import useAuthStore from '../../store/authStore'

export default function MobileLogin() {
  const [username, setUsername] = useState('student')
  const [password, setPassword] = useState('123456')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(username, password)
      setAuth(data.token, data.user)
      navigate('/mobile/home', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const quickFill = (u, p) => {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 20, background: 'var(--bg-grad)' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="sidebar-logo-icon" style={{ width: 38, height: 38, fontSize: 18, borderRadius: 10 }}>⚡</span>
            <strong style={{ fontSize: 17 }}>AI实操避错</strong>
          </div>
        </div>
        <div className="hero" style={{ padding: '12px 14px', marginBottom: 14 }}>
          <div className="hero-title" style={{ fontSize: 14 }}>沉浸式风险实训平台</div>
          <div className="hero-sub">发现错误 → 规避错误 → 能力提升</div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="input" placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn" disabled={loading}>{loading ? <><span className="spinner" /> 登录中…</> : '登录'}</button>
        </form>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn-outline chip-btn" onClick={() => quickFill('admin', 'admin123')}>管理员</button>
          <button className="btn-outline chip-btn" onClick={() => quickFill('teacher', '123456')}>实验教师</button>
          <button className="btn-outline chip-btn" onClick={() => quickFill('student', '123456')}>学生</button>
        </div>
      </div>
    </div>
  )
}
