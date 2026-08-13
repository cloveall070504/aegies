import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { login } from '../../api/auth'
import { isMobileViewport } from '../../utils/media'
import useAuthStore from '../../store/authStore'
import ThemeToggle from '../../components/ThemeToggle'

export default function Login() {
  const [username, setUsername] = useState('student')
  const [password, setPassword] = useState('123456')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(username, password)
      setAuth(data.token, data.user)
      const from = location.state?.from
      if (from && (from.pathname.startsWith('/mobile') || from.pathname.startsWith('/dashboard') || from.pathname.startsWith('/scenario') || from.pathname.startsWith('/profile') || from.pathname.startsWith('/scan') || from.pathname.startsWith('/cases') || from.pathname.startsWith('/docs') || from.pathname.startsWith('/quiz') || from.pathname.startsWith('/admin'))) {
        navigate(from.pathname, { replace: true })
      } else {
        navigate(isMobileViewport() ? '/mobile/home' : '/dashboard', { replace: true })
      }
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card" style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>AI实操避错系统</h1>
          <ThemeToggle />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>反向RAG + 双智能体校验 · 沉浸式风险实训平台</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="input" placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <button className="btn" disabled={loading}>{loading ? '登录中…' : '登录'}</button>
        </form>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-outline" onClick={() => quickFill('admin', 'admin123')} style={{ fontSize: 12, padding: '4px 10px' }}>管理员</button>
          <button className="btn-outline" onClick={() => quickFill('student', '123456')} style={{ fontSize: 12, padding: '4px 10px' }}>学生</button>
          <button className="btn-outline" onClick={() => quickFill('worker', '123456')} style={{ fontSize: 12, padding: '4px 10px' }}>工人</button>
        </div>
      </div>
    </div>
  )
}
