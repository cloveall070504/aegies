import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import useAuthStore from './store/authStore'
import useThemeStore from './store/themeStore'
import ErrorBoundary from './components/ErrorBoundary'

// PC 端页面
import Login from './pages/PC/Login'
import Dashboard from './pages/PC/Dashboard'
import Sandbox from './pages/PC/Sandbox'
import Profile from './pages/PC/Profile'
import Cases from './pages/PC/Cases'
import Docs from './pages/PC/Docs'
import AdminDashboard from './pages/PC/AdminDashboard'
import Assignments from './pages/PC/Assignments'
import SimTrain from './pages/PC/SimTrain'
import TrainingReport from './pages/PC/TrainingReport'
import TrainingOverview from './pages/PC/TrainingOverview'
import TeacherWorkbench from './pages/PC/TeacherWorkbench'
import StudentManagement from './pages/PC/StudentManagement'
import SystemSettings from './pages/PC/SystemSettings'
import StudentHome from './pages/PC/StudentHome'
import TeacherHome from './pages/PC/TeacherHome'
import AdminHome from './pages/PC/AdminHome'
import CaseManagement from './pages/PC/CaseManagement'
import QuizManagement from './pages/PC/QuizManagement'
import RiskPointManagement from './pages/PC/RiskPointManagement'
import InferReview from './pages/PC/InferReview'
import TrainingReportTeacher from './pages/PC/TrainingReportTeacher'
import SystemInfo from './pages/PC/SystemInfo'
import UsersPage from './pages/PC/UsersPage'

// 布局
import PCLayout from './layouts/PCLayout'

function Protected({ children }) {
  const { token } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />
  return <ErrorBoundary>{children}</ErrorBoundary>
}

/** 角色守卫：仅允许指定角色访问（如 admin/teacher） */
function RoleGuard({ children, roles }) {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: location }} />
  if (user && !roles.includes(user.role)) {
    const roleLabel = { admin: '管理员', teacher: '教师', student: '学生' }[user.role] || user.role
    const needLabel = roles.map((r) => ({ admin: '管理员', teacher: '教师', student: '学生' }[r] || r)).join(' / ')
    return (
      <PCLayout>
        <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48 }}>🔒</div>
          <h2 style={{ margin: '12px 0 8px' }}>无访问权限</h2>
          <p className="muted">当前身份为「{roleLabel}」，该页面仅限 {needLabel} 访问。<br />请用对应账号登录，或在左侧切换角色体验。</p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => window.history.back()}>返回上一页</button>
        </div>
      </PCLayout>
    )
  }
  return <ErrorBoundary>{children}</ErrorBoundary>
}

export default function App() {
  const { theme } = useThemeStore()
  const home = '/dashboard'
  const location = useLocation()

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <Routes>
      {/* 登录 */}
      <Route path="/login" element={<Login />} />

      {/* PC 端 */}
      <Route
        path="/dashboard"
        element={<Protected><PCLayout><Dashboard /></PCLayout></Protected>}
      />
      <Route
        path="/sandbox"
        element={<Protected><PCLayout><Sandbox /></PCLayout></Protected>}
      />
      <Route
        path="/profile"
        element={<Protected><PCLayout><Profile /></PCLayout></Protected>}
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
        path="/admin"
        element={<RoleGuard roles={['admin', 'teacher']}><PCLayout><AdminDashboard /></PCLayout></RoleGuard>}
      />
      <Route
        path="/assignments"
        element={<Protected><PCLayout><Assignments /></PCLayout></Protected>}
      />
      <Route
        path="/students"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><StudentManagement /></PCLayout></RoleGuard>}
      />
      <Route
        path="/settings"
        element={<RoleGuard roles={['admin']}><PCLayout><SystemSettings /></PCLayout></RoleGuard>}
      />
      {/* PC：教师内容创作台（可视化编辑场景/题库） */}
      <Route
        path="/teacher"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><TeacherWorkbench /></PCLayout></RoleGuard>}
      />
      {/* 教师/管理员：案例管理（闭环输入端） */}
      <Route
        path="/cases-manage"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><CaseManagement /></PCLayout></RoleGuard>}
      />
      {/* 教师/管理员：风险点管理（知识库编辑/审核 + 学生反馈闭环） */}
      <Route
        path="/risk-points"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><RiskPointManagement /></PCLayout></RoleGuard>}
      />
      {/* 教师/管理员：题库管理 */}
      <Route
        path="/quiz-manage"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><QuizManagement /></PCLayout></RoleGuard>}
      />
      {/* 教师/管理员：推演批改 */}
      <Route
        path="/review"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><InferReview /></PCLayout></RoleGuard>}
      />
      {/* 教师/管理员：培训报告（闭环输出端） */}
      <Route
        path="/training-report"
        element={<RoleGuard roles={['teacher', 'admin']}><PCLayout><TrainingReportTeacher /></PCLayout></RoleGuard>}
      />
      {/* 管理员：系统信息 */}
      <Route
        path="/system-info"
        element={<RoleGuard roles={['admin']}><PCLayout><SystemInfo /></PCLayout></RoleGuard>}
      />
      {/* 管理员：用户管理 */}
      <Route
        path="/users"
        element={<RoleGuard roles={['admin']}><PCLayout><UsersPage /></PCLayout></RoleGuard>}
      />
      {/* PC：分步骤模拟培训 */}
      <Route
        path="/sim/:sceneCode/:stage"
        element={<Protected><PCLayout><SimTrain /></PCLayout></Protected>}
      />
      {/* PC：培训总览（所有场景进度） */}
      <Route
        path="/training"
        element={<Protected><PCLayout><TrainingOverview /></PCLayout></Protected>}
      />
      {/* PC：单场景培训前后对比报告 */}
      <Route
        path="/training/:sceneCode"
        element={<Protected><PCLayout><TrainingReport /></PCLayout></Protected>}
      />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
