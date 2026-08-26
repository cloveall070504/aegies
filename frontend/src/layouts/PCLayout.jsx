import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import SceneSelector from '../components/SceneSelector'
import EngineModeBadge from '../components/EngineModeBadge'
import MascotAssistant from '../components/MascotAssistant'
import useAuthStore from '../store/authStore'
import useThemeStore from '../store/themeStore'
import useNotificationStore from '../store/notificationStore'
import { useLocation } from 'react-router-dom'
import { useSceneName } from '../hooks/useSceneType'

const ROLE_META = {
  admin: { label: '管理员', color: '#f59e0b', bg: 'rgba(245,158,11,0.16)', home: '系统管理总览' },
  teacher: { label: '实验教师', color: '#3b82f6', bg: 'rgba(59,130,246,0.16)', home: '教学工作台' },
  student: { label: '学生', color: '#10b981', bg: 'rgba(16,185,129,0.16)', home: '我的学习主页' },
}

// 学生：纯学习者视角（9 项，全部为"学/练/看"）
const MENU_STUDENT = [
  { to: '/dashboard', label: '我的主页', icon: '🏠' },
  { to: '/sandbox', label: '避错沙盘', icon: '🧪' },
  { to: '/assignments', label: '我的作业', icon: '📋' },
  { to: '/cases', label: '案例库', icon: '📚' },
  { to: '/profile', label: '个人画像', icon: '👤' },
  { to: '/training', label: '学习中心', icon: '🎓' },
  { to: '/docs', label: '文档管理', icon: '📄' },
  { to: '/learning', label: '学习路径', icon: '🧭' },
  { to: '/notifications', label: '消息中心', icon: '🔔' },
]

// 教师：纯教学管理者视角（8 项，全部为"建/管/批"，不重复学生的练/学）
const MENU_TEACHER = [
  { to: '/dashboard', label: '教学工作台', icon: '🏠' },
  { to: '/cases-manage', label: '案例管理', icon: '📝' },
  { to: '/risk-points', label: '风险点管理', icon: '📌' },
  { to: '/quiz-manage', label: '题库管理', icon: '🧰' },
  { to: '/assignments', label: '作业布置', icon: '📋' },
  { to: '/students', label: '学员管理', icon: '👥' },
  { to: '/review', label: '推演批改', icon: '🔍' },
  { to: '/training-report', label: '培训报告', icon: '📑' },
  { to: '/admin', label: '组织风险画像', icon: '🗂️' },
  { to: '/notifications', label: '消息中心', icon: '🔔' },
]

// 管理员：纯系统治理者视角（7 项，聚焦用户/配置/总览）
const MENU_ADMIN = [
  { to: '/dashboard', label: '系统总览', icon: '🏠' },
  { to: '/users', label: '用户管理', icon: '👤' },
  { to: '/cases-manage', label: '案例总库', icon: '📝' },
  { to: '/risk-points', label: '风险点总库', icon: '📌' },
  { to: '/settings', label: '系统设置', icon: '⚙️' },
  { to: '/system-info', label: '系统信息', icon: '📡' },
  { to: '/training-report', label: '培训报告', icon: '📑' },
  { to: '/admin', label: '组织风险画像', icon: '🗂️' },
  { to: '/notifications', label: '消息中心', icon: '🔔' },
]

export default function PCLayout({ children }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const theme = useThemeStore((s) => s.theme)
  const role = user?.role || 'student'
  const roleMeta = ROLE_META[role] || ROLE_META.student
  const sceneName = useSceneName()
  const location = useLocation()
  const unread = useNotificationStore((s) => s.unreadCount)
  const refreshUnread = useNotificationStore((s) => s.refresh)
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  // 进入布局时拉一次未读数；之后每次路由切换（如从消息中心返回）再刷新，
  // 保证铃铛红点在标记已读后实时更新，无需整页刷新。
  useEffect(() => {
    refreshUnread()
  }, [refreshUnread, location.pathname])

  const menu = role === 'teacher' ? MENU_TEACHER : role === 'admin' ? MENU_ADMIN : MENU_STUDENT
  const sectionLabel = role === 'teacher' ? '👨‍🏫 教学管理者专区' : role === 'admin' ? '🛡️ 系统治理专区' : '🎓 学习者专区'

  const onLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">⚡</span>
          实战避错系统
        </div>

        {/* 当前身份（显眼角色徽标） */}
        <div
          style={{
            margin: '4px 14px 10px',
            padding: '8px 12px',
            borderRadius: 12,
            background: roleMeta.bg,
            border: `1px solid ${roleMeta.color}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: roleMeta.color,
              background: '#fff',
              borderRadius: 999,
              padding: '3px 10px',
              whiteSpace: 'nowrap',
            }}
          >
            {roleMeta.label}
          </span>
          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.display_name || user?.username}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>{user?.department || '未分组'}</div>
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {menu.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) => (isActive ? 'menu-item active' : 'menu-item')}
            >
              <span>{m.icon}</span>
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <EngineModeBadge variant="chip" />
          <button
            className="theme-toggle"
            onClick={() => useThemeStore.getState().toggleTheme()}
            title="切换暗色 / 浅色"
          >
            <span className="theme-toggle__icon">{theme === 'dark' ? '🌙' : '☀️'}</span>
            <span className="theme-toggle__label mono">
              {theme === 'dark' ? 'DARK' : 'LIGHT'}
            </span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px' }}>
            <span className="avatar">
              {user?.display_name?.[0] || user?.username?.[0] || 'U'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">
                {user?.display_name || user?.username}
              </div>
              <div className="muted" style={{ fontSize: 11 }}>{sectionLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px 12px' }}>
            <SceneSelector compact />
            <button className="btn-outline" onClick={onLogout} style={{ width: '100%' }}>退出登录</button>
          </div>
        </div>
      </aside>
      <main className="pc-main">
        <div className="hud-bar">
          <span className="hud-bar__status"><span className="hud-bar__dot" />SYSTEM ONLINE</span>
          <span className="hud-bar__sep" />
          <span className="hud-bar__mod">反向RAG · 双智能体校验引擎</span>
          <span className="hud-bar__spacer" />
          <button className="hud-bell" onClick={() => navigate('/notifications')} title="消息中心">
            <span style={{ fontSize: 16 }}>🔔</span>
            {unread > 0 && <span className="hud-bell__dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <span className="hud-bar__scene">场景 · {sceneName || '通用'}</span>
          <span className="hud-bar__clock mono">{clock.toLocaleTimeString('zh-CN', { hour12: false })}</span>
        </div>
        {children}
      </main>
      {role === 'student' && <MascotAssistant />}
    </div>
  )
}
