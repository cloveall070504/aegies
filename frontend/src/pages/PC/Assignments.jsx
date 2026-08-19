import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAssignments, createAssignment, getAssignmentProgress, closeAssignment, deleteAssignment, updateAssignmentProgress, asList } from '../../api'
import { formatTime } from '../../utils/format'
import { useSceneCode, useSceneName } from '../../hooks/useSceneType'
import PageHead from '../../components/PageHead'
import useAuthStore from '../../store/authStore'

const TASK_LABEL = { sim_train: '模拟实训', quiz: '自测考试', infer: '风险推演' }
const TASK_LINK = { sim_train: '/training', quiz: '/training', infer: '/sandbox' }
const STATUS_LABEL = { active: '进行中', closed: '已关闭' }
const STATUS_COLOR = { active: 'var(--green)', closed: 'var(--muted)' }
const PROGRESS_LABEL = { pending: '未完成', in_progress: '进行中', completed: '已完成' }
const PROGRESS_COLOR = { pending: 'var(--muted)', in_progress: 'var(--yellow)', completed: 'var(--green)' }

export default function Assignments() {
  const role = useAuthStore((s) => s.user?.role) || 'student'
  const isTeacher = role === 'teacher' || role === 'admin'
  return isTeacher ? <TeacherAssignments /> : <StudentAssignments />
}

/* ============ 学生：我的作业 ============ */
function StudentAssignments() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    listAssignments('all')
      .then((d) => setList(asList(d)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const markDone = async (a) => {
    try {
      await updateAssignmentProgress({ assignment_id: a.id, status: 'completed', score: a.my_score || 0 })
      load()
    } catch (e) { setError(e.message) }
  }

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 100 }} /></div>

  // 拆成「进行中 / 已完成」两段：已完成的作业始终保留可见，不会因标记完成而消失
  const inProgress = list.filter((a) => a.my_status !== 'completed')
  const completed = list.filter((a) => a.my_status === 'completed')

  const renderCard = (a) => {
    const done = a.my_status === 'completed'
    return (
      <div key={a.id} className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{a.title}</h3>
          <span style={{ color: STATUS_COLOR[a.status], fontSize: 12, fontWeight: 600 }}>{STATUS_LABEL[a.status]}</span>
        </div>
        {a.description && <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{a.description}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <span className="badge">{TASK_LABEL[a.task_type]}</span>
          {a.scene_code && <span className="badge">场景：{a.scene_code}</span>}
          {a.due_date && <span className="badge">截止：{formatTime(a.due_date)}</span>}
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          我的状态：
          <span style={{ color: PROGRESS_COLOR[a.my_status], fontWeight: 600 }}> {PROGRESS_LABEL[a.my_status]}</span>
          {done && a.my_score != null && ` · 得分 ${a.my_score}`}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!done ? (
            <>
              <button className="btn chip-btn" onClick={() => navigate(TASK_LINK[a.task_type] || '/training')}>去做 →</button>
              <button className="btn-outline chip-btn" onClick={() => markDone(a)}>标记完成</button>
            </>
          ) : (
            <span className="badge" style={{ color: 'var(--green)' }}>✓ 已完成</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        eyebrow="学习者专区"
        title="我的作业"
        desc={`共 ${list.length} 项作业，其中 ${inProgress.length} 项进行中，${completed.length} 项已完成`}
        actions={<span className="tag" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>学生视图</span>}
      />
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {list.length === 0 ? (
        <div className="card empty"><div className="empty-icon">📋</div><div className="empty-text">老师还没有布置作业</div></div>
      ) : (
        <>
          {inProgress.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h3 className="section-title" style={{ marginBottom: 12 }}>进行中（{inProgress.length}）</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {inProgress.map((a) => renderCard(a))}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--green)' }}>已完成（{completed.length}）</h3>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {completed.map((a) => renderCard(a))}
              </div>
            </section>
          )}
          {inProgress.length === 0 && completed.length > 0 && (
            <div className="card muted" style={{ marginTop: 4 }}>🎉 全部作业已完成，继续保持！</div>
          )}
        </>
      )}
    </div>
  )
}

/* ============ 教师/管理员：作业管理 ============ */
function TeacherAssignments() {
  const sceneCode = useSceneCode()
  const sceneName = useSceneName()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [progressView, setProgressView] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', scene_code: sceneCode, task_type: 'sim_train', due_date: '' })
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    listAssignments('all').then((d) => setList(asList(d))).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (showCreate) setForm((p) => ({ ...p, scene_code: sceneCode, title: `${sceneName}安全培训` }))
  }, [showCreate, sceneCode, sceneName])

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('请输入作业标题'); return }
    setCreating(true); setError('')
    try {
      await createAssignment({ ...form, due_date: form.due_date || null })
      setShowCreate(false)
      setForm({ title: '', description: '', scene_code: '', task_type: 'sim_train', due_date: '' })
      load()
    } catch (e) { setError(e.message) } finally { setCreating(false) }
  }

  const handleClose = async (id) => {
    if (!confirm('确认关闭此作业？关闭后学生将无法再提交。')) return
    try { await closeAssignment(id); load() } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('确认删除此作业？删除后所有学生的进度记录也会一并清除，且不可恢复。')) return
    try { await deleteAssignment(id); load() } catch (e) { setError(e.message) }
  }

  const handleViewProgress = async (id) => {
    try { const d = await getAssignmentProgress(id); setProgressView(d) } catch (e) { setError(e.message) }
  }

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 100 }} /></div>

  return (
    <div>
      <PageHead
        eyebrow="教学管理者专区"
        title="作业管理"
        desc="布置作业、跟踪学员完成进度"
        actions={<button className="btn" onClick={() => setShowCreate(!showCreate)}>{showCreate ? '取消' : '＋ 布置作业'}</button>}
      />

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--r-sm)', background: 'var(--primary-bg)', border: '1px solid var(--primary-weak)' }}
      >
        <span className="tag">教师视图</span>
        <span className="muted" style={{ fontSize: 13 }}>共 {list.length} 项作业 · 布置后自动通知全体学生</span>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title"><span className="dot" />布置新作业</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>作业标题</label>
              <input className="input" placeholder="如：化学实验安全培训（第一周）" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>作业说明</label>
              <textarea className="input" rows={2} placeholder="描述作业要求..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>任务类型</label>
                <select className="input" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })}>
                  <option value="sim_train">模拟实训</option>
                  <option value="quiz">自测考试</option>
                  <option value="infer">风险推演</option>
                </select>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>关联场景（默认当前）</label>
                <input className="input" value={form.scene_code} readOnly />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>截止时间</label>
                <input className="input" type="datetime-local" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <button className="btn" onClick={handleCreate} disabled={creating}>{creating ? <><span className="spinner" /> 发布中...</> : '发布作业'}</button>
          </div>
        </div>
      )}

      {progressView && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent, #4f8cff)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />学生进度：{progressView.assignment.title}</h3>
            <button className="btn-outline chip-btn" onClick={() => setProgressView(null)}>关闭</button>
          </div>
          <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>完成 {progressView.completed} / {progressView.total} 人</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>学生</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px' }}>院系</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>状态</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>分数</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px' }}>完成时间</th>
                </tr>
              </thead>
              <tbody>
                {progressView.students.map((s) => (
                  <tr key={s.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}>{s.display_name || s.username}</td>
                    <td style={{ padding: '8px 12px' }} className="muted">{s.department}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}><span style={{ color: PROGRESS_COLOR[s.status], fontWeight: 600 }}>{PROGRESS_LABEL[s.status]}</span></td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{s.score || '-'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }} className="muted">{s.completed_at ? formatTime(s.completed_at) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div className="card empty"><div className="empty-icon">📋</div><div className="empty-text">暂无作业，点击"布置作业"创建</div></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {list.map((a) => (
            <div key={a.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15 }}>{a.title}</h3>
                <span style={{ color: STATUS_COLOR[a.status], fontSize: 12, fontWeight: 600 }}>{STATUS_LABEL[a.status]}</span>
              </div>
              {a.description && <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{a.description}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="badge">{TASK_LABEL[a.task_type]}</span>
                {a.scene_code && <span className="badge">场景：{a.scene_code}</span>}
                {a.due_date && <span className="badge">截止：{formatTime(a.due_date)}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{a.completed_count ?? 0} / {a.total_students ?? 0} 人完成 · 创建于 {formatTime(a.created_at)}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-outline chip-btn" onClick={() => handleViewProgress(a.id)}>查看进度</button>
                {a.status === 'active' && <button className="btn-outline chip-btn" onClick={() => handleClose(a.id)} style={{ color: 'var(--red)' }}>关闭</button>}
                <button className="btn-outline chip-btn" onClick={() => handleDelete(a.id)} style={{ color: 'var(--red)' }}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
