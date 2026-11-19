import { useEffect, useState } from 'react'
import { listManagedQuiz, createQuizQuestion, updateQuizQuestion, deleteQuizQuestion } from '../../api'
import PaperGenerator from './PaperGenerator'

const emptyForm = { question: '', options: ['', ''], answer: 0, qtype: 'choice', answer_seq: [], seqPos: [1, 2], answer_text: '', analysis: '', scene_type: 'experiment', scene_code: '' }

const QTYPE_LABEL = { choice: '单选', judge: '判断', sequence: '排序', open: '开放' }

// 由“每步正确位置(1-based)”反推索引排列
function computeSeq(seqPos) {
  return seqPos
    .map((pos, idx) => ({ pos: Number(pos) || 0, idx }))
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.idx)
}

export default function QuizManagement() {
  const [tab, setTab] = useState('bank')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    listManagedQuiz('', '')
      .then((d) => setList(d.questions || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); setError('') }
  const openEdit = (q) => {
    setEditing(q)
    const seq = q.answer_seq || []
    const seqPos = seq.length ? seq.map((idx) => seq.indexOf(idx) + 1) : q.options.map((_, i) => i + 1)
    setForm({
      question: q.question, options: [...q.options], answer: q.answer,
      qtype: q.qtype || 'choice', answer_seq: seq, seqPos,
      answer_text: q.answer_text || '', analysis: q.analysis || '',
      scene_type: q.scene_type || 'general', scene_code: q.scene_code || '',
    })
    setShowForm(true); setError('')
  }

  const setOption = (i, val) => { const opts = [...form.options]; opts[i] = val; setForm({ ...form, options: opts }) }
  const addOption = () => setForm({ ...form, options: [...form.options, ''], seqPos: [...form.seqPos, form.seqPos.length + 1] })
  const removeOption = (i) => {
    const opts = form.options.filter((_, idx) => idx !== i)
    const seqPos = form.seqPos.filter((_, idx) => idx !== i)
    setForm({ ...form, options: opts, seqPos, answer: Math.min(form.answer, Math.max(0, opts.length - 2)) })
  }

  const save = async () => {
    if (!form.question.trim()) { setError('请填写题干'); return }
    const qt = form.qtype
    const payload = {
      question: form.question.trim(), qtype: qt,
      scene_type: form.scene_type, scene_code: form.scene_code,
      analysis: form.analysis.trim(),
    }
    if (qt === 'open') {
      if (!form.answer_text.trim()) { setError('开放题必须填写参考答案'); return }
      payload.options = []
      payload.answer_text = form.answer_text.trim()
      payload.answer = 0
    } else if (qt === 'judge') {
      payload.options = ['错误', '正确']
      payload.answer = form.answer === 1 ? 1 : 0
    } else if (qt === 'sequence') {
      const opts = form.options.map((o) => o.trim()).filter(Boolean)
      if (opts.length < 2) { setError('排序题至少需要 2 个步骤'); return }
      const seq = computeSeq(form.seqPos.slice(0, opts.length))
      const expect = Array.from({ length: opts.length }, (_, i) => i).join(',')
      if (seq.slice().sort((a, b) => a - b).join(',') !== expect) {
        setError('排序题：每步的“正确顺序”需为 1~n 且不重复'); return
      }
      payload.options = opts
      payload.answer_seq = seq
      payload.answer = 0
    } else {
      const opts = form.options.map((o) => o.trim()).filter(Boolean)
      if (opts.length < 2) { setError('至少需要 2 个非空选项'); return }
      if (form.answer < 0 || form.answer >= opts.length) { setError('正确答案超出选项范围'); return }
      payload.options = opts
      payload.answer = form.answer
    }
    setSaving(true); setError('')
    try {
      if (editing) await updateQuizQuestion(editing.id, payload)
      else await createQuizQuestion(payload)
      setShowForm(false); load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const onDelete = async (q) => {
    if (!confirm('确认删除该题目？')) return
    try { await deleteQuizQuestion(q.id); load() } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>题库管理</h1>
        {tab === 'bank' && <button className="btn" onClick={openCreate}>＋ 新建题目</button>}
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <button
          className="chip-btn"
          style={{ padding: '8px 18px', borderRadius: '9px 9px 0 0', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: tab === 'bank' ? 'var(--card)' : 'transparent', color: tab === 'bank' ? 'var(--primary)' : 'var(--text-2)' }}
          onClick={() => setTab('bank')}
        >📝 题库</button>
        <button
          className="chip-btn"
          style={{ padding: '8px 18px', borderRadius: '9px 9px 0 0', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: tab === 'paper' ? 'var(--card)' : 'transparent', color: tab === 'paper' ? 'var(--primary)' : 'var(--text-2)' }}
          onClick={() => setTab('paper')}
        >🎫 一键组卷</button>
      </div>

      {tab === 'paper' ? (
        <PaperGenerator />
      ) : (
        <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#3b82f6', borderRadius: 999, padding: '4px 10px' }}>教师内容生产</span>
        <span className="muted" style={{ fontSize: 13 }}>支持单选 / 判断 / 操作排序 / 开放题（开放题练习模式接 AI 批改）。自建题库 → 学生自测 → 成绩回流画像</span>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title"><span className="dot" />{editing ? '编辑题目' : '新建题目'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>题型</label>
              <select className="input" value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
                <option value="choice">单选题</option>
                <option value="judge">判断题</option>
                <option value="sequence">操作排序题</option>
                <option value="open">开放题（练习 AI 批改）</option>
              </select>
            </div>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>题干 *</label>
              <input className="input" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="如：操作腐蚀性试剂时必须佩戴？" />
            </div>

            {form.qtype === 'open' ? (
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>参考答案（练习批改参考）*</label>
                <textarea className="input" rows={3} value={form.answer_text} onChange={(e) => setForm({ ...form, answer_text: e.target.value })} placeholder="描述期望学生答到的关键安全/操作要点" />
              </div>
            ) : (
              <div>
                <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                  {form.qtype === 'sequence' ? '操作步骤（点击右侧数字设定正确顺序）' : form.qtype === 'judge' ? '判断题固定两个选项（选正确项）' : '选项（点选圆圈标记正确答案）'}
                </label>
                {form.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    {form.qtype !== 'judge' && (
                      <input type="radio" name="answer" checked={form.answer === i} onChange={() => setForm({ ...form, answer: i })} />
                    )}
                    <input className="input" style={{ flex: 1 }} value={opt} disabled={form.qtype === 'judge'} onChange={(e) => setOption(i, e.target.value)} placeholder={`${form.qtype === 'sequence' ? '步骤' : '选项'} ${i + 1}`} />
                    {form.qtype === 'sequence' && (
                      <input className="input" style={{ width: 70 }} type="number" min={1} value={form.seqPos[i] ?? i + 1} onChange={(e) => { const sp = [...form.seqPos]; sp[i] = Number(e.target.value); setForm({ ...form, seqPos: sp }) }} title="该步骤的正确顺序(1起)" />
                    )}
                    {form.qtype === 'choice' && (
                      <button className="btn-outline chip-btn" disabled={form.options.length <= 2} onClick={() => removeOption(i)}>✕</button>
                    )}
                  </div>
                ))}
                {form.qtype === 'choice' && <button className="btn-outline chip-btn" onClick={addOption}>＋ 添加选项</button>}
                {form.qtype === 'judge' && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <label className="muted" style={{ fontSize: 13 }}><input type="radio" name="judgeAns" checked={form.answer === 0} onChange={() => setForm({ ...form, answer: 0 })} /> 正确项=“错误”</label>
                    <label className="muted" style={{ fontSize: 13 }}><input type="radio" name="judgeAns" checked={form.answer === 1} onChange={() => setForm({ ...form, answer: 1 })} /> 正确项=“正确”</label>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>场景类型</label>
                <select className="input" value={form.scene_type} onChange={(e) => setForm({ ...form, scene_type: e.target.value })}>
                  <option value="experiment">化学实验</option>
                  <option value="general">通用</option>
                </select>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>场景代码(可选)</label>
                <input className="input" value={form.scene_code} onChange={(e) => setForm({ ...form, scene_code: e.target.value })} placeholder="如 chem_lab / chem_titration" />
              </div>
            </div>
            <div>
              <label className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>解析</label>
              <textarea className="input" rows={2} value={form.analysis} onChange={(e) => setForm({ ...form, analysis: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={save} disabled={saving}>{saving ? <><span className="spinner" /> 保存中…</> : '保存'}</button>
              <button className="btn-outline" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div className="card"><div className="skeleton" style={{ height: 120 }} /></div> : (
        list.length === 0 ? (
          <div className="card empty"><div className="empty-icon">🧰</div><div className="empty-text">题库为空，点击"新建题目"添加</div></div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {list.map((q) => (
              <div className="card" key={q.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 600, flex: 1 }}>{q.question}</p>
                  <span className="chip-btn" style={{ fontSize: 11, background: 'var(--primary-bg)', whiteSpace: 'nowrap' }}>{QTYPE_LABEL[q.qtype] || '单选'}</span>
                </div>
                {q.qtype === 'sequence' ? (
                  <div className="muted" style={{ fontSize: 13 }}>正确顺序：{(q.answer_seq || []).map((i) => q.options[i]).join(' → ')}</div>
                ) : q.qtype === 'open' ? (
                  <div className="muted" style={{ fontSize: 13 }}>参考答案：{q.answer_text || '—'}</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {q.options.map((o, i) => (
                      <li key={i} style={{ color: i === q.answer ? 'var(--green)' : 'inherit', fontWeight: i === q.answer ? 600 : 400 }}>
                        {o}{i === q.answer ? ' ✓' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="muted" style={{ fontSize: 12, margin: '8px 0' }}>{q.scene_type}{q.scene_code ? ' · ' + q.scene_code : ''}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-outline chip-btn" onClick={() => openEdit(q)}>编辑</button>
                  <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => onDelete(q)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
        </div>
      )}
    </div>
  )
}
