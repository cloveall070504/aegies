import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { login } from '../../api/auth'
import useAuthStore from '../../store/authStore'

const PROTECTED_PREFIX = '/dashboard|/scenario|/sandbox|/profile|/scan|/cases|/docs|/quiz|/admin|/training|/sim|/users|/nexus'

export default function Login() {
  const [username, setUsername] = useState('student')
  const [password, setPassword] = useState('123456')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (u, p) => {
    setLoading(true)
    setError('')
    try {
      const data = await login(u, p)
      setAuth(data.token, data.user)
      // 按角色落地：学生进数字人主页 /nexus，教师/管理员进工作台 /dashboard
      const role = data.user?.role
      const home = role === 'student' ? '/nexus' : '/dashboard'
      const from = location.state?.from
      if (from && new RegExp(`^(${PROTECTED_PREFIX})`).test(from.pathname)) {
        navigate(from.pathname, { replace: true })
      } else {
        navigate(home, { replace: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    submit(username, password)
  }

  const quickLogin = (u, p) => submit(u, p)

  return (
    <div className="login-split">
      <aside className="login-aside">
        <div className="login-aside__brand">
          <span className="login-aside__logo">⚡</span>
          <div>
            <h1 className="login-aside__name">实战避错系统</h1>
            <div className="login-aside__sub">REVERSE-RAG · DUAL-AGENT GUARD</div>
          </div>
        </div>

        <div className="login-aside__hero">
          <h2 className="login-aside__title">把每一次<br />危险操作<br />拦在事故发生前</h2>
          <p className="login-aside__desc">
            沉浸式化学实验风险实训平台：发现错误 → 理解后果 → 规避错误 → 能力提升。
            规则引擎为唯一真相源，双智能体在线校验，AI 仅做解释增强。
          </p>
        </div>

        <div className="login-aside__status">
          <div className="login-aside__stat"><span className="login-aside__dot" /> 引擎状态：规则引擎在线 · AI 增强待命中</div>
          <div className="login-aside__stat"><span className="login-aside__dot" /> 知识库：化学实验风险点已装载</div>
          <div className="login-aside__stat"><span className="login-aside__dot" /> 终端：SECURE CHANNEL · TLS 1.3</div>
        </div>

        <div className="login-aside__foot">© 实战避错系统 · 化学实验安全培训控制台 v2.0</div>
      </aside>

      <main className="login-main">
        <div className="card login-card hud energy-line">
          <div className="eyebrow">操作员登录 / OPERATOR ACCESS</div>
          <h1 className="page-title" style={{ fontSize: 24, marginBottom: 6 }}>欢迎回来</h1>
          <p className="muted" style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.6 }}>
            沉浸式风险实训平台 · 发现错误 → 规避错误 → 能力提升
          </p>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 7, fontSize: 13 }}>用户名</label>
              <input className="input" placeholder="请输入用户名" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 7, fontSize: 13 }}>密码</label>
              <input className="input" type="password" placeholder="请输入密码" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button className="btn" disabled={loading} onClick={onSubmit} style={{ width: '100%' }}>{loading ? <><span className="spinner" /> 登录中…</> : '登 录'}</button>
          </form>
          <div className="divider" style={{ margin: '22px 0 16px' }} />
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>一键切换体验（三个角色菜单 / 权限各不相同）</div>
          <div className="login-quick">
            <button className="btn-outline chip-btn" onClick={() => quickLogin('admin', 'admin123')}>👨‍💼 管理员</button>
            <button className="btn-outline chip-btn" onClick={() => quickLogin('teacher', '123456')}>🧑‍🏫 实验教师</button>
            <button className="btn-outline chip-btn" onClick={() => quickLogin('student', '123456')}>🎓 学生</button>
          </div>
        </div>
      </main>
    </div>
  )
}
