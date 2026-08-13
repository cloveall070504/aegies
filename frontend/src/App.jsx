import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import useAuthStore from './store/authStore'
import useThemeStore from './store/themeStore'
import { isMobileViewport } from './utils/media'

// PC 端页面
import Login from './pages/PC/Login'
import Dashboard from './pages/PC/Dashboard'
import ScenarioInfer from './pages/PC/ScenarioInfer'
import Profile from './pages/PC/Profile'
import Scan from './pages/PC/Scan'
import Cases from './pages/PC/Cases'
import Docs from './pages/PC/Docs'
import Quiz from './pages/PC/Quiz'
import AdminDashboard from './pages/PC/AdminDashboard'

// 移动端页面
import MobileLogin from './pages/Mobile/Login'
import MobileHome from './pages/Mobile/Home'
import MobileScan from './pages/Mobile/Scan'
import MobileInfer from './pages/Mobile/Infer'
import MobileProfile from './pages/Mobile/Profile'
import MobileQuiz from './pages/Mobile/Quiz'

// 布局
import PCLayout from './layouts/PCLayout'
import MobileLayout from './layouts/MobileLayout'

function Protected({ children }) {
  const { token } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

function useMediaNav() {
  const isMobile = isMobileViewport()
  return isMobile ? '/mobile/home' : '/dashboard'
}

export default function App() {
  const { theme } = useThemeStore()
  const home = useMediaNav()
  const location = useLocation()

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <Routes>
      {/* 登录（按视口分发） */}
      <Route path="/login" element={<Login />} />
      <Route path="/mobile/login" element={<MobileLogin />} />

      {/* PC 端 */}
      <Route
        path="/dashboard"
        element={<Protected><PCLayout><Dashboard /></PCLayout></Protected>}
      />
      <Route
        path="/scenario"
        element={<Protected><PCLayout><ScenarioInfer /></PCLayout></Protected>}
      />
      <Route
        path="/profile"
        element={<Protected><PCLayout><Profile /></PCLayout></Protected>}
      />
      <Route
        path="/scan"
        element={<Protected><PCLayout><Scan /></PCLayout></Protected>}
      />
      <Route
        path="/cases"
        element={<Protected><PCLayout><Cases /></PCLayout></Protected>}
      />
      <Route
        path="/docs"
        element={<Protected><PCLayout><Docs /></PCLayout></Protected>}
      />
      <Route
        path="/quiz"
        element={<Protected><PCLayout><Quiz /></PCLayout></Protected>}
      />
      <Route
        path="/admin"
        element={<Protected><PCLayout><AdminDashboard /></PCLayout></Protected>}
      />

      {/* 移动端 */}
      <Route path="/mobile/home" element={<Protected><MobileLayout><MobileHome /></MobileLayout></Protected>} />
      <Route path="/mobile/scan" element={<Protected><MobileLayout><MobileScan /></MobileLayout></Protected>} />
      <Route path="/mobile/infer" element={<Protected><MobileLayout><MobileInfer /></MobileLayout></Protected>} />
      <Route path="/mobile/profile" element={<Protected><MobileLayout><MobileProfile /></MobileLayout></Protected>} />
      <Route path="/mobile/quiz" element={<Protected><MobileLayout><MobileQuiz /></MobileLayout></Protected>} />

      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
