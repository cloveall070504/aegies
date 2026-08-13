import { NavLink, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import useAuthStore from '../store/authStore'

const MENU = [
  { to: '/dashboard', label: '驾驶舱', icon: '📊' },
  { to: '/scenario', label: '场景推演', icon: '🧪' },
  { to: '/scan', label: '风险扫描', icon: '🔍' },
  { to: '/profile', label: '个人画像', icon: '👤' },
  { to: '/quiz', label: '自测考试', icon: '📝' },
  { to: '/cases', label: '案例库', icon: '📚' },
  { to: '/docs', label: '文档管理', icon: '📄' },
  { to: '/admin', label: '管理后台', icon: '🗂️' },
]

export default function PCLayout({ children }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--card)',
          borderRight: '1px solid var(--border)',
          padding: '16px 12px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, padding: '8px 12px 16px' }}>
          AI实操避错系统
        </div>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) => (isActive ? 'menu-item active' : 'menu-item')}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: 14,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <span>{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              {user?.display_name?.[0] || user?.username?.[0] || 'U'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.display_name || user?.username}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>{user?.role} · {user?.department}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
            <ThemeToggle />
            <button className="btn-outline" onClick={onLogout} style={{ flex: 1 }}>退出</button>
          </div>
        </div>
      </aside>
      <main style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</main>
    </div>
  )
}
