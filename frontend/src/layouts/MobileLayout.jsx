import { NavLink, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import useAuthStore from '../store/authStore'

const TABS = [
  { to: '/mobile/home', label: '首页', icon: '🏠' },
  { to: '/mobile/scan', label: '扫描', icon: '🔍' },
  { to: '/mobile/infer', label: '推演', icon: '🧪' },
  { to: '/mobile/quiz', label: '自测', icon: '📝' },
  { to: '/mobile/profile', label: '我的', icon: '👤' },
]

export default function MobileLayout({ children }) {
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  const onLogout = () => {
    logout()
    navigate('/mobile/login')
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 64, background: 'var(--bg)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--card)',
          borderBottom: '1px solid var(--border)',
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <strong style={{ fontSize: 15 }}>AI实操避错</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ThemeToggle />
          <button className="btn-outline" onClick={onLogout} style={{ padding: '4px 10px', fontSize: 12 }}>退出</button>
        </div>
      </header>
      <main style={{ padding: 14 }}>{children}</main>
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--card)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          zIndex: 10,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => (isActive ? 'mobile-tab active' : 'mobile-tab')}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 0 6px',
              fontSize: 11,
              color: 'var(--text-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
