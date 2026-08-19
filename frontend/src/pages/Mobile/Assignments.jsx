/** Mobile 作业中心：学生查看/完成被分配的作业，教师查看进度与批改 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listAssignments, getAssignmentProgress, updateAssignmentProgress,
  closeAssignment, getAssignmentGradebook,
} from '../../api'
import useAuthStore from '../../store/authStore'
import { useSceneName } from '../../hooks/useSceneType'

const TASK_LABEL = { sim_train: '模拟实训', quiz: '自测考试', infer: '风险推演' }
const STATUS_LABEL = { active: '进行中', closed: '已关闭' }
const PROGRESS_LABEL = { pending: '未开始', in_progress: '进行中', completed: '已完成' }
const PROGRESS_COLOR = { pending: 'var(--muted)', in_progress: 'var(--yellow)', completed: 'var(--green)' }

export default function MobileAssignments() {
  const { user } = useAuthStore()
  const sceneName = useSceneName()
  const navigate = useNavigate()
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progressView, setProgressView] = useState(null)
  const [gradebook, setGradebook] = useState(null)

  const load = () => {
    setLoading(true)
    listAssignments('all')
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleComplete = async (a) => {
    try {
      await updateAssignmentProgress({ assignment_id: a.id, status: 'completed', score: a.scene_code ? 100 : 0 })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleClose = async (id) => {
    if (!confirm('确认关闭此作业？')) return
    try {
      await closeAssignment(id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleProgress = async (id) => {
    try {
      const data = await getAssignmentProgress(id)
      setProgressView(data)
      setGradebook(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleGradebook = async (id) => {
    try {
      const data = await getAssignmentGradebook(id)
      setGradebook(data)
      setProgressView(null)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="hero" style={{ marginBottom: 4 }}>
        <div className="hero-title">📋 作业中心</div>
        <div className="hero-sub">{isTeacher ? '布置、追踪与批改培训作业' : `当前场景：${sceneName} · 查看并完成作业`}</div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="card"><div className="skeleton" style={{ height: 80 }} /></div>}

      {progressView && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>学生进度：{progressView.assignment.title}</strong>
            <button className="btn-outline chip-btn" onClick={() => setProgressView(null)}>关闭</button>
          </div>
          <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>完成 {progressView.completed}/{progressView.total} 人</div>
          {progressView.students.map((s) => (
            <div key={s.user_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.display_name || s.username}</div>
                <div className="muted" style={{ fontSize: 11 }}>{s.department}</div>
              </div>
              <span style={{ color: PROGRESS_COLOR[s.status], fontSize: 12, fontWeight: 600 }}>{PROGRESS_LABEL[s.status]}</span>
              <strong style={{ fontSize: 14, minWidth: 36, textAlign: 'right' }}>{s.score || '-'}</strong>
            </div>
          ))}
        </div>
      )}

      {gradebook && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>成绩册：{gradebook.assignment.title}</strong>
            <button className="btn-outline chip-btn" onClick={() => setGradebook(null)}>关闭</button>
          </div>
          {gradebook.students?.length === 0 && <div className="muted">暂无学生提交</div>}
          {gradebook.students?.map((s) => (
            <div key={s.user_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.display_name || s.username}</div>
                <div className="muted" style={{ fontSize: 11 }}>{s.comment || (s.status === 'completed' ? '已提交' : '未提交')}</div>
              </div>
              <strong style={{ fontSize: 16, color: s.score >= 60 ? 'var(--green)' : 'var(--red)' }}>{s.score || '-'}</strong>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 && !loading && (
        <div className="card empty"><div className="empty-icon">📋</div><div className="empty-text">暂无作业</div></div>
      )}

      {list.map((a) => (
        <div key={a.id} className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{a.title}</strong>
            <span className="badge" style={{ color: a.status === 'active' ? 'var(--green)' : 'var(--muted)' }}>{STATUS_LABEL[a.status]}</span>
          </div>
          {a.description && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.description}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            <span className="badge">{TASK_LABEL[a.task_type]}</span>
            {a.scene_code && <span className="badge">场景：{a.scene_code}</span>}
            {a.due_date && <span className="badge">截止：{a.due_date.slice(0, 10)}</span>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {a.completed_count ?? 0}/{a.total_students ?? 0} 人完成
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!isTeacher && a.status === 'active' && (
              <button className="btn chip-btn" style={{ flex: 1 }} onClick={() => handleComplete(a)}>
                ✅ 标记完成
              </button>
            )}
            {isTeacher && (
              <>
                <button className="btn-outline chip-btn" onClick={() => handleProgress(a.id)}>进度</button>
                <button className="btn-outline chip-btn" onClick={() => handleGradebook(a.id)}>成绩册</button>
                {a.status === 'active' && (
                  <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => handleClose(a.id)}>关闭</button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
