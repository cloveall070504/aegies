import useAuthStore from '../../store/authStore'
import StudentHome from './StudentHome'
import TeacherHome from './TeacherHome'
import AdminHome from './AdminHome'

export default function Dashboard() {
  const { user } = useAuthStore()
  const role = user?.role || 'student'
  if (role === 'teacher') return <TeacherHome />
  if (role === 'admin') return <AdminHome />
  return <StudentHome />
}
