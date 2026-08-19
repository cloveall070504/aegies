import { useState, useEffect } from 'react'
import useAuthStore from '../../store/authStore'
import {
  listScenes, createScene, updateScene, deleteScene,
  getSceneSteps, addSceneStep, updateSceneStep, deleteSceneStep,
} from '../../api/scenes'
import {
  listManagedQuiz, createQuizQuestion, updateQuizQuestion, deleteQuizQuestion,
} from '../../api/index'

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, margin: '10px 0 4px', color: 'var(--text)' }
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
}
const smallBtn = (primary) => ({
  padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13,
  background: primary ? 'var(--primary)' : 'var(--bg-soft)', color: primary ? '#fff' : 'var(--text)',
  fontWeight: 600,
})

function MsgBar({ msg, err }) {
  if (err) return <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>
  if (msg) return <div className="alert alert-info" style={{ marginBottom: 12 }}>{msg}</div>
  return null
}

/* ============ 步骤选项编辑器（对象：label/correct/consequence/explanation） ============ */
function StepOptionsEditor({ options, setOptions }) {
  const setOpt = (i, key, val) => {
    setOptions(options.map((o, idx) => {
      if (key === 'correct') return { ...o, correct: idx === i } // 单选：仅当前项正确
      if (idx !== i) return o
      return { ...o, [key]: val }
    }))
  }
  const addOpt = () => setOptions([...options, { label: '', correct: false, consequence: '', explanation: '' }])
  const removeOpt = (i) => setOptions(options.filter((_, idx) => idx !== i))

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...labelStyle, margin: '6px 0 4px' }}>选项（至少 2 个，标记一个正确）</div>
      {options.map((o, i) => (
        <div key={i} className="card" style={{ padding: 10, marginBottom: 8, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="radio" name="correct-opt" checked={!!o.correct} onChange={() => setOpt(i, 'correct', true)} title="设为正确" />
            <input
              style={inputStyle}
              placeholder={`选项 ${i + 1} 文本`}
              value={o.label}
              onChange={(e) => setOpt(i, 'label', e.target.value)}
            />
            <button style={{ ...smallBtn(false), padding: '7px 10px' }} onClick={() => removeOpt(i)} disabled={options.length <= 2}>✕</button>
          </div>
          <input
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="选错时的后果（错误项必填，正确项可空）"
            value={o.consequence || ''}
            onChange={(e) => setOpt(i, 'consequence', e.target.value)}
          />
          <input
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="讲解 / 正确做法说明"
            value={o.explanation || ''}
            onChange={(e) => setOpt(i, 'explanation', e.target.value)}
          />
        </div>
      ))}
      <button style={smallBtn(false)} onClick={addOpt}>＋ 添加选项</button>
    </div>
  )
}

/* ============ 题库选项编辑器（字符串数组 + 答案索引） ============ */
function QuizOptionsEditor({ options, setOptions, answer, setAnswer }) {
  const setOpt = (i, val) => setOptions(options.map((o, idx) => (idx === i ? val : o)))
  const addOpt = () => setOptions([...options, ''])
  const removeOpt = (i) => {
    const next = options.filter((_, idx) => idx !== i)
    setOptions(next)
    if (answer === i) setAnswer(0)
    else if (answer > i) setAnswer(answer - 1)
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...labelStyle, margin: '6px 0 4px' }}>选项（至少 2 个，选一个为正确答案）</div>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input type="radio" name="quiz-answer" checked={answer === i} onChange={() => setAnswer(i)} title="设为正确答案" />
          <input style={inputStyle} placeholder={`选项 ${i + 1}`} value={o} onChange={(e) => setOpt(i, e.target.value)} />
          <button style={{ ...smallBtn(false), padding: '7px 10px' }} onClick={() => removeOpt(i)} disabled={options.length <= 2}>✕</button>
        </div>
      ))}
      <button style={smallBtn(false)} onClick={addOpt}>＋ 添加选项</button>
    </div>
  )
}

/* ============ 场景管理 ============ */
function SceneManager({ role }) {
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [stepsMap, setStepsMap] = useState({})
  const [showSceneForm, setShowSceneForm] = useState(false)
  const [editingScene, setEditingScene] = useState(null)
  const [showStepForm, setShowStepForm] = useState(false)
  const [editingStep, setEditingStep] = useState(null)
  const [stepSceneCode, setStepSceneCode] = useState(null)

  const loadScenes = async () => {
    setLoading(true)
    try {
      const data = await listScenes()
      setScenes(data || [])
    } catch (e) {
      setErr(e.message || '加载场景失败')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadScenes() }, [])

  const toggleExpand = async (code) => {
    if (expanded === code) { setExpanded(null); return }
    setExpanded(code)
    if (!stepsMap[code]) {
      try {
        const d = await getSceneSteps(code)
        setStepsMap((m) => ({ ...m, [code]: d.steps || [] }))
      } catch (e) {
        setErr(e.message || '加载步骤失败')
      }
    }
  }

  const onDeleteScene = async (s) => {
    if (!window.confirm(`确认删除场景「${s.name}」？该场景下的步骤与培训记录也会一并删除。`)) return
    try {
      await deleteScene(s.scene_code)
      setMsg(`已删除场景 ${s.name}`)
      setExpanded(null)
      await loadScenes()
    } catch (e) { setErr(e.message || '删除失败') }
  }

  const onDeleteStep = async (sceneCode, step) => {
    if (!window.confirm(`确认删除步骤「${step.step_title}」？`)) return
    try {
      await deleteSceneStep(sceneCode, step.id)
      setMsg('步骤已删除')
      setStepsMap((m) => ({ ...m, [sceneCode]: (m[sceneCode] || []).filter((x) => x.id !== step.id) }))
    } catch (e) { setErr(e.message || '删除失败') }
  }

  return (
    <div>
      <MsgBar msg={msg} err={err} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={() => { setEditingScene(null); setShowSceneForm(true); setMsg(''); setErr('') }}>＋ 新建场景</button>
      </div>

      {showSceneForm && (
        <SceneForm
          role={role}
          initial={editingScene}
          onClose={() => { setShowSceneForm(false); setEditingScene(null) }}
          onSaved={async () => { setShowSceneForm(false); setEditingScene(null); setMsg(editingScene ? '场景已更新' : '场景已创建'); await loadScenes() }}
          setErr={setErr}
        />
      )}

      {loading ? (
        <div className="card"><div className="skeleton" style={{ height: 60 }} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scenes.map((s) => {
            const expandedNow = expanded === s.scene_code
            const steps = stepsMap[s.scene_code] || []
            const owned = !s.builtin
            const editable = role === 'admin' || owned
            return (
              <div className="card" key={s.id} style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22 }}>{s.icon || '📋'}</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{s.scene_code} · {s.category}</div>
                  </div>
                  {s.builtin && <span className="badge" style={{ background: 'var(--bg-soft)' }}>内置</span>}
                  <button className="btn-outline chip-btn" onClick={() => toggleExpand(s.scene_code)}>{expandedNow ? '收起步骤' : `步骤 (${steps.length || '?'})`}</button>
                  {editable && (
                    <button className="btn-outline chip-btn" onClick={() => { setEditingScene(s); setShowSceneForm(true); setMsg(''); setErr('') }}>编辑</button>
                  )}
                  {editable && (
                    <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => onDeleteScene(s)}>删除</button>
                  )}
                  {!editable && <span className="muted" style={{ fontSize: 12 }}>内置（管理员可改）</span>}
                </div>

                {expandedNow && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: 14 }}>分步骤模拟（{steps.length} 步）</strong>
                      {editable && (
                        <button className="btn-outline chip-btn" onClick={() => {
                          setEditingStep(null); setStepSceneCode(s.scene_code); setShowStepForm(true); setMsg(''); setErr('')
                        }}>＋ 新增步骤</button>
                      )}
                    </div>
                    {steps.length === 0 && <div className="muted" style={{ fontSize: 13 }}>暂无步骤，点击下方新增。</div>}
                    {steps.map((st) => (
                      <div key={st.id} className="card" style={{ padding: 10, marginBottom: 8, background: 'var(--card-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span className="step-badge">{st.step_order}</span>
                          <strong style={{ fontSize: 13, flex: 1 }}>{st.step_title}</strong>
                          <span className={`risk-badge risk-${st.risk_level}`}>{st.risk_level}</span>
                          {editable && (
                            <button className="btn-outline chip-btn" onClick={() => { setEditingStep(st); setStepSceneCode(s.scene_code); setShowStepForm(true); setMsg(''); setErr('') }}>编辑</button>
                          )}
                          {editable && (
                            <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => onDeleteStep(s.scene_code, st)}>删除</button>
                          )}
                        </div>
                      </div>
                    ))}

                    {showStepForm && stepSceneCode === s.scene_code && (
                      <StepForm
                        role={role}
                        sceneCode={s.scene_code}
                        initial={editingStep}
                        stepCount={(stepsMap[s.scene_code] || []).length}
                        onClose={() => { setShowStepForm(false); setEditingStep(null); setStepSceneCode(null) }}
                        onSaved={async (savedStep) => {
                          setShowStepForm(false); setEditingStep(null); setStepSceneCode(null)
                          setMsg(editingStep ? '步骤已更新' : '步骤已新增')
                          try {
                            const d = await getSceneSteps(s.scene_code)
                            setStepsMap((m) => ({ ...m, [s.scene_code]: d.steps || [] }))
                          } catch (e) { setErr(e.message) }
                        }}
                        setErr={setErr}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* 场景新建/编辑表单 */
function SceneForm({ initial, onClose, onSaved, setErr }) {
  const [f, setF] = useState({
    scene_code: initial?.scene_code || '',
    name: initial?.name || '',
    icon: initial?.icon || '📋',
    category: initial?.category || 'custom',
    description: initial?.description || '',
    theme_name: initial?.theme_name || 'student',
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const submit = async () => {
    if (!f.scene_code.trim() || !f.name.trim()) { setErr('场景代码和名称必填'); return }
    try {
      if (initial) await updateScene(initial.scene_code, { ...f, scene_code: f.scene_code.trim() })
      else await createScene({ ...f, scene_code: f.scene_code.trim() })
      onSaved()
    } catch (e) { setErr(e.message || '保存失败') }
  }
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{initial ? '编辑场景' : '新建场景'}</div>
      <label style={labelStyle}>场景代码（英文标识，如 my_lab）</label>
      <input style={inputStyle} disabled={!!initial} value={f.scene_code} onChange={(e) => set('scene_code', e.target.value)} placeholder="my_lab" />
      <label style={labelStyle}>显示名称</label>
      <input style={inputStyle} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="我的实验场景" />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>图标 emoji</label>
          <input style={inputStyle} value={f.icon} onChange={(e) => set('icon', e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>分类</label>
          <select className="input" value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="experiment">experiment 化学实验</option>
            <option value="custom">custom 自定义</option>
          </select>
        </div>
      </div>
      <label style={labelStyle}>描述</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} value={f.description} onChange={(e) => set('description', e.target.value)} />
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={submit}>保存</button>
        <button className="btn-outline" onClick={onClose}>取消</button>
      </div>
    </div>
  )
}

/* 步骤新建/编辑表单 */
function StepForm({ sceneCode, initial, stepCount, onClose, onSaved, setErr }) {
  const [step_order, setOrder] = useState(initial?.step_order ?? (stepCount + 1))
  const [step_title, setTitle] = useState(initial?.step_title || '')
  const [step_text, setText] = useState(initial?.step_text || '')
  const [risk_level, setRisk] = useState(initial?.risk_level || 'medium')
  const [step_hint, setHint] = useState(initial?.step_hint || '')
  const [options, setOptions] = useState(
    initial?.options?.length
      ? initial.options.map((o) => ({ label: o.label || '', correct: !!o.correct, consequence: o.consequence || '', explanation: o.explanation || '' }))
      : [{ label: '', correct: true, consequence: '', explanation: '' }, { label: '', correct: false, consequence: '', explanation: '' }]
  )

  const submit = async () => {
    if (!step_title.trim()) { setErr('步骤标题必填'); return }
    if (options.length < 2) { setErr('至少需要 2 个选项'); return }
    if (!options.some((o) => o.correct)) { setErr('请标记一个正确选项'); return }
    if (options.some((o) => !o.label.trim())) { setErr('选项文本不能为空'); return }
    const payload = {
      scene_code: sceneCode,
      step_order: Number(step_order) || 1,
      step_title: step_title.trim(),
      step_text: step_text,
      risk_level,
      step_hint,
      options,
    }
    try {
      if (initial) await updateSceneStep(sceneCode, initial.id, payload)
      else await addSceneStep(payload)
      onSaved()
    } catch (e) { setErr(e.message || '保存失败') }
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 8, background: 'var(--card-2)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{initial ? '编辑步骤' : '新增步骤'}</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: '0 0 90px' }}>
          <label style={labelStyle}>步骤序号</label>
          <input style={inputStyle} type="number" value={step_order} onChange={(e) => setOrder(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>步骤标题</label>
          <input style={inputStyle} value={step_title} onChange={(e) => setTitle(e.target.value)} placeholder="第N步：加热试管" />
        </div>
        <div style={{ flex: '0 0 120px' }}>
          <label style={labelStyle}>风险等级</label>
          <select className="input" value={risk_level} onChange={(e) => setRisk(e.target.value)}>
            <option value="low">low 低</option>
            <option value="medium">medium 中</option>
            <option value="high">high 高</option>
          </select>
        </div>
      </div>
      <label style={labelStyle}>场景还原描述</label>
      <textarea style={{ ...inputStyle, minHeight: 56 }} value={step_text} onChange={(e) => setText(e.target.value)} placeholder="学生看到这一步时面对的情境描述" />
      <StepOptionsEditor options={options} setOptions={setOptions} />
      <label style={labelStyle}>提示</label>
      <input style={inputStyle} value={step_hint} onChange={(e) => setHint(e.target.value)} placeholder="给学生的提示" />
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={submit}>保存步骤</button>
        <button className="btn-outline" onClick={onClose}>取消</button>
      </div>
    </div>
  )
}

/* ============ 题库管理 ============ */
function QuizManager({ role }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const d = await listManagedQuiz('', '')
      setQuestions(d.questions || [])
    } catch (e) { setErr(e.message || '加载题库失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const onDelete = async (q) => {
    if (!window.confirm(`确认删除题目「${q.question}」？`)) return
    try {
      await deleteQuizQuestion(q.id)
      setMsg('题目已删除')
      await load()
    } catch (e) { setErr(e.message || '删除失败') }
  }

  return (
    <div>
      <MsgBar msg={msg} err={err} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn" onClick={() => { setEditing(null); setShowForm(true); setMsg(''); setErr('') }}>＋ 新建题目</button>
      </div>

      {showForm && (
        <QuestionForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={async () => { setShowForm(false); setEditing(null); setMsg(editing ? '题目已更新' : '题目已创建'); await load() }}
          setErr={setErr}
        />
      )}

      {loading ? (
        <div className="card"><div className="skeleton" style={{ height: 60 }} /></div>
      ) : questions.length === 0 ? (
        <div className="card muted">暂无自建题目。点击右上角「新建题目」可视化录入，或用「学习中心」的导入功能批量导入。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {questions.map((q) => (
            <div className="card" key={q.id} style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{q.question}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {q.scene_type} · {q.scene_code || '通用'} · 答案：{q.options[q.answer]}
                  </div>
                  {q.analysis && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>解析：{q.analysis}</div>}
                </div>
                <button className="btn-outline chip-btn" onClick={() => { setEditing(q); setShowForm(true); setMsg(''); setErr('') }}>编辑</button>
                <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => onDelete(q)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* 题目新建/编辑表单 */
function QuestionForm({ initial, onClose, onSaved, setErr }) {
  const [question, setQuestion] = useState(initial?.question || '')
  const [scene_type, setType] = useState(initial?.scene_type || 'experiment')
  const [scene_code, setCode] = useState(initial?.scene_code || '')
  const [options, setOptions] = useState(initial?.options?.length ? initial.options : ['', ''])
  const [answer, setAnswer] = useState(initial?.answer ?? 0)
  const [analysis, setAnalysis] = useState(initial?.analysis || '')

  const submit = async () => {
    if (!question.trim()) { setErr('题干必填'); return }
    if (options.length < 2 || options.some((o) => !o.trim())) { setErr('至少需要 2 个非空选项'); return }
    if (answer < 0 || answer >= options.length) { setErr('请选择正确答案'); return }
    const payload = {
      question: question.trim(),
      scene_type,
      scene_code: scene_code.trim(),
      options,
      answer,
      analysis: analysis.trim(),
    }
    try {
      if (initial) await updateQuizQuestion(initial.id, payload)
      else await createQuizQuestion(payload)
      onSaved()
    } catch (e) { setErr(e.message || '保存失败') }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{initial ? '编辑题目' : '新建题目'}</div>
      <label style={labelStyle}>题干</label>
      <textarea style={{ ...inputStyle, minHeight: 56 }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="请输入题目" />
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>场景类型</label>
          <select className="input" value={scene_type} onChange={(e) => setType(e.target.value)}>
            <option value="experiment">experiment 化学实验</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>场景代码（可选，留空=通用）</label>
          <input style={inputStyle} value={scene_code} onChange={(e) => setCode(e.target.value)} placeholder="chem_lab" />
        </div>
      </div>
      <QuizOptionsEditor options={options} setOptions={setOptions} answer={answer} setAnswer={setAnswer} />
      <label style={labelStyle}>解析</label>
      <textarea style={{ ...inputStyle, minHeight: 48 }} value={analysis} onChange={(e) => setAnalysis(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={submit}>保存题目</button>
        <button className="btn-outline" onClick={onClose}>取消</button>
      </div>
    </div>
  )
}

/* ============ 入口 ============ */
export default function TeacherWorkbench() {
  const [tab, setTab] = useState('scene')
  const role = useAuthStore((s) => s.user?.role)

  const tabBtn = (key, label) => ({
    padding: '8px 18px', borderRadius: '9px 9px 0 0', border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
    background: tab === key ? 'var(--card)' : 'transparent',
    color: tab === key ? 'var(--primary)' : 'var(--text-2)',
  })

  return (
    <div>
      <h1 className="page-title">教学创作台</h1>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <button style={tabBtn('scene', '🎬 场景编辑')} onClick={() => setTab('scene')}>🎬 场景编辑</button>
        <button style={tabBtn('quiz', '📝 题库编辑')} onClick={() => setTab('quiz')}>📝 题库编辑</button>
      </div>
      {tab === 'scene' ? <SceneManager role={role} /> : <QuizManager role={role} />}
    </div>
  )
}
