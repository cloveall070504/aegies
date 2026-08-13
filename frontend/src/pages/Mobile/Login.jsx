import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../api/auth'
import useAuthStore from '../../store/authStore'
import ThemeToggle from '../../components/ThemeToggle'

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 18 }}>AI实操避错</strong>
          <ThemeToggle />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>反向RAG · 双智能体校验 · 风险实训</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="input" placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <button className="btn" disabled={loading}>{loading ? '登录中…' : '登录'}</button>
        </form>
      </div>
    </div>
  )
}
