import { useEffect, useState } from 'react'
import { createUser, deleteUser, listUsers, updateUser } from '../api/auth'

const ROLE_BADGE = {
  admin: { label: '管理员', color: '#f59e0b', bg: 'rgba(245,158,11,0.16)' },
  teacher: { label: '教师', color: '#3b82f6', bg: 'rgba(59,130,246,0.16)' },
  student: { label: '学生', color: '#10b981', bg: 'rgba(16,185,129,0.16)' },
}

export default function UserManagement() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [role, setRole] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', role: 'student', display_name: '', department: '' })

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const d = await listUsers({ role, keyword, page: 1, page_size: 50 })
      setRows(d.items || [])
      setTotal(d.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ username: '', password: '', role: 'student', display_name: '', department: '' })
    setShowForm(true)
  }

  const openEdit = (u) => {
    setEditing(u)
    setForm({ username: u.username, password: '', role: u.role, display_name: u.display_name || '', department: u.department || '' })
    setShowForm(true)
  }

  const submit = async () => {
    setError('')
    try {
      if (editing) {
        const payload = { role: form.role, display_name: form.display_name, department: form.department }
        if (form.password) payload.password = form.password
        await updateUser(editing.id, payload)
      } else {
        if (!form.username || !form.password) return setError('用户名与密码必填')
        if (form.password.length < 6) return setError('密码至少 6 位')
        await createUser({ ...form, is_active: true })
      }
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const toggleActive = async (u) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active })
      await load()
    } catch (e) { setError(e.message) }
  }

  const remove = async (u) => {
    if (!window.confirm(`确认删除用户「${u.username}」？`)) return
    try {
      await deleteUser(u.id)
      await load()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div className="toolbar">
        <select className="select" value={role} onChange={(e) => { setRole(e.target.value); }}>
          <option value="">全部角色</option>
          <option value="admin">管理员</option>
          <option value="teacher">教师</option>
          <option value="student">学生</option>
        </select>
        <input className="input" style={{ maxWidth: 200 }} placeholder="搜索用户名/姓名" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button className="btn-outline" onClick={load}>查询</button>
        <button className="btn" onClick={openCreate}>+ 新建用户</button>
        <span className="muted" style={{ marginLeft: 'auto' }}>共 {total} 人</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-soft)', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>用户名</th>
              <th style={{ padding: '10px 14px' }}>姓名</th>
              <th style={{ padding: '10px 14px' }}>部门</th>
              <th style={{ padding: '10px 14px' }}>角色</th>
              <th style={{ padding: '10px 14px' }}>状态</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ padding: 24, textAlign: 'center' }}>{loading ? '加载中…' : '暂无用户'}</td></tr>
            )}
            {rows.map((u) => {
              const rb = ROLE_BADGE[u.role] || ROLE_BADGE.student
              return (
                <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.username}</td>
                  <td style={{ padding: '10px 14px' }}>{u.display_name || '—'}</td>
                  <td style={{ padding: '10px 14px' }} className="muted">{u.department || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: rb.color, background: rb.bg, borderRadius: 999, padding: '3px 10px' }}>{rb.label}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 12, color: u.is_active === false ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{u.is_active === false ? '已停用' : '正常'}</span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-outline chip-btn" onClick={() => openEdit(u)}>编辑</button>
                    <button className="btn-outline chip-btn" onClick={() => toggleActive(u)}>{u.is_active === false ? '启用' : '停用'}</button>
                    <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => remove(u)}>删除</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-mask" onClick={() => setShowForm(false)}>
          <div className="card" style={{ width: 420, maxWidth: '92%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{editing ? `编辑用户 · ${editing.username}` : '新建用户'}</h3>
            {!editing && (
              <div style={{ marginBottom: 10 }}>
                <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>用户名</label>
                <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editing} />
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>密码{editing ? '（留空=不修改）' : ''}</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>角色</label>
              <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="student">学生</option>
                <option value="teacher">教师</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>姓名</label>
              <input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>部门</label>
              <input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-outline" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn" onClick={submit}>{editing ? '保存' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
