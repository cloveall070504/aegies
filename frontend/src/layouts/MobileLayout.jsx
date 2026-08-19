import { NavLink, useNavigate } from 'react-router-dom'
import SceneSelector from '../components/SceneSelector'
import useAuthStore from '../store/authStore'
import useThemeStore from '../store/themeStore'

const TABS = [
  { to: '/mobile/home', label: '首页', icon: '🏠' },
  { to: '/mobile/training', label: '学习', icon: '🎓' },
  { to: '/mobile/scan', label: '扫描', icon: '🔍' },
  { to: '/mobile/infer', label: '推演', icon: '🧪' },
  { to: '/mobile/assignments', label: '作业', icon: '📋' },
  { to: '/mobile/profile', label: '我的', icon: '👤' },
]

export default function MobileLayout({ children }) {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const theme = useThemeStore((s) => s.theme)

  const onLogout = () => {
    logout()
    navigate('/mobile/login')
  }

  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <SceneSelector compact />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="theme-toggle theme-toggle--sm"
            onClick={() => useThemeStore.getState().toggleTheme()}
            title="切换暗色 / 浅色"
          >
            <span className="theme-toggle__icon">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>
          <button className="btn-outline chip-btn" onClick={onLogout}>退出</button>
        </div>
      </header>
      <main className="mobile-body">{children}</main>
      <nav className="mobile-tabbar">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => (isActive ? 'mobile-tab active' : 'mobile-tab')}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
