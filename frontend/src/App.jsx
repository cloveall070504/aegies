import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import useAuthStore from './store/authStore'
import useThemeStore from './store/themeStore'
import { isMobileViewport } from './utils/media'
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

// 移动端页面
import MobileLogin from './pages/Mobile/Login'
import MobileHome from './pages/Mobile/Home'
import MobileScan from './pages/Mobile/Scan'
import MobileInfer from './pages/Mobile/Infer'
import MobileProfile from './pages/Mobile/Profile'
import MobileDocs from './pages/Mobile/Docs'
import MobileSimTrain from './pages/Mobile/SimTrain'
import MobileTrainingReport from './pages/Mobile/TrainingReport'
import MobileTrainingOverview from './pages/Mobile/TrainingOverview'
import MobileAssignments from './pages/Mobile/Assignments'

// 布局
import PCLayout from './layouts/PCLayout'
import MobileLayout from './layouts/MobileLayout'

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

      {/* 移动端 */}
      <Route path="/mobile/home" element={<Protected><MobileLayout><MobileHome /></MobileLayout></Protected>} />
      <Route path="/mobile/scan" element={<Protected><MobileLayout><MobileScan /></MobileLayout></Protected>} />
      <Route path="/mobile/infer" element={<Protected><MobileLayout><MobileInfer /></MobileLayout></Protected>} />
      <Route path="/mobile/profile" element={<Protected><MobileLayout><MobileProfile /></MobileLayout></Protected>} />
      <Route path="/mobile/docs" element={<Protected><MobileLayout><MobileDocs /></MobileLayout></Protected>} />
      {/* Mobile：分步骤模拟培训 */}
      <Route path="/mobile/sim/:sceneCode/:stage" element={<Protected><MobileLayout><MobileSimTrain /></MobileLayout></Protected>} />
      {/* Mobile：培训总览 */}
      <Route path="/mobile/training" element={<Protected><MobileLayout><MobileTrainingOverview /></MobileLayout></Protected>} />
      {/* Mobile：单场景培训报告 */}
      <Route path="/mobile/training/:sceneCode" element={<Protected><MobileLayout><MobileTrainingReport /></MobileLayout></Protected>} />
      {/* Mobile：作业中心 */}
      <Route path="/mobile/assignments" element={<Protected><MobileLayout><MobileAssignments /></MobileLayout></Protected>} />

      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
