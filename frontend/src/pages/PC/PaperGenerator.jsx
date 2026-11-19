import { useState, useEffect } from 'react'
import { generatePaper, listPapers, getPaper, deletePaper } from '../../api'

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, margin: '10px 0 4px', color: 'var(--text)' }
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
}

const QTYPE_LABEL = { choice: '单选', judge: '判断', sequence: '排序', open: '开放' }

export default function PaperGenerator() {
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ title: '随堂测验', scene_code: 'chem_lab', count: 10 })
  const [generating, setGenerating] = useState(false)
  const [detail, setDetail] = useState(null)

  const load = () => {
    setLoading(true)
    listPapers().then((d) => setPapers(d || [])).catch((e) => setErr(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const onGenerate = async () => {
    if (!form.title.trim()) { setErr('请填写测验卷标题'); return }
    setGenerating(true); setErr(''); setMsg('')
    try {
      const d = await generatePaper({ ...form, count: Number(form.count) || 10 })
      setMsg(`已生成测验卷「${d.paper.title}」，共 ${d.paper.question_count} 题`)
      setDetail(d)
      await load()
    } catch (e) { setErr(e.message) } finally { setGenerating(false) }
  }

  const onView = async (id) => {
    setErr('')
    try { const d = await getPaper(id); setDetail(d) } catch (e) { setErr(e.message) }
  }

  const onDelete = async (id) => {
    if (!window.confirm('确认删除此测验卷？')) return
    try { await deletePaper(id); setMsg('测验卷已删除'); await load() } catch (e) { setErr(e.message) }
  }

  const copyLink = (id) => {
    // 生成学生作答链接（前端路由，实际可接到二维码下发）
    const url = `${window.location.origin}/quiz-paper/${id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => setMsg(`已复制链接：${url}`)).catch(() => setMsg(url))
    } else {
      setMsg(url)
    }
  }

  return (
    <div>
      {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="alert alert-info" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* 组卷表单 */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🎫 一键组卷</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>按场景从题库自动抽题，生成随堂测验卷，可复制链接下发学生</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label style={labelStyle}>测验卷标题</label>
            <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>场景代码</label>
            <input style={inputStyle} value={form.scene_code} onChange={(e) => setForm({ ...form, scene_code: e.target.value })} placeholder="chem_lab / chem_titration ..." />
          </div>
          <div style={{ flex: '0 0 120px' }}>
            <label style={labelStyle}>抽题数量</label>
            <input style={inputStyle} type="number" min="1" max="50" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </div>
        </div>
        <button className="btn" style={{ marginTop: 14 }} onClick={onGenerate} disabled={generating}>
          {generating ? <><span className="spinner" /> 组卷中…</> : '🎯 生成测验卷'}
        </button>
      </div>

      {/* 生成的试卷列表 */}
      {loading ? (
        <div className="card"><div className="skeleton" style={{ height: 60 }} /></div>
      ) : papers.length === 0 ? (
        <div className="card muted">暂无测验卷。填好上方参数，点「生成测验卷」创建第一份。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {papers.map((p) => (
            <div className="card" key={p.id} style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20 }}>🎫</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700 }}>{p.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{p.scene_code || '通用'} · {p.question_count} 题</div>
                </div>
                <button className="btn-outline chip-btn" onClick={() => onView(p.id)}>预览</button>
                <button className="btn-outline chip-btn" onClick={() => copyLink(p.id)}>复制链接</button>
                <button className="btn-outline chip-btn" style={{ color: 'var(--red)' }} onClick={() => onDelete(p.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 试卷详情预览 */}
      {detail && (
        <div className="card" style={{ marginTop: 16, border: '1px solid var(--accent, #4f8cff)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />测验卷预览：{detail.paper?.title || '详情'}</h3>
            <button className="btn-outline chip-btn" onClick={() => setDetail(null)}>关闭</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>共 {detail.paper?.question_count ?? (detail.questions?.length ?? 0)} 题（含答案，仅教师可见）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(detail.questions || []).map((q, i) => (
              <div key={q.id || i} className="card" style={{ padding: 12, background: 'var(--bg-soft)' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  <span className="badge" style={{ marginRight: 8 }}>{i + 1}</span>
                  <span style={{ marginRight: 6 }}>[{QTYPE_LABEL[q.qtype || 'choice'] || '单选'}]</span>
                  {q.question}
                </div>
                <div style={{ marginTop: 6, fontSize: 12 }} className="muted">
                  {q.options?.map((opt, oi) => (
                    <span key={oi} style={{ marginRight: 14, color: oi === q.answer ? 'var(--green)' : undefined, fontWeight: oi === q.answer ? 700 : 400 }}>
                      {String.fromCharCode(65 + oi)}. {opt}{oi === q.answer ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                {q.analysis && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>解析：{q.analysis}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
