import { useState } from 'react'
import DualCheckBadge from '../../components/DualCheckBadge'
import { useSceneName } from '../../hooks/useSceneType'
import useAuthStore from '../../store/authStore'
import { useQuiz } from '../../hooks/useQuiz'

const QTYPE_LABEL = { choice: '单选', judge: '判断', sequence: '排序', open: '开放' }

export default function Quiz() {
  const sceneName = useSceneName()
  const token = useAuthStore((s) => s.token)
  const {
    questions, answers, result, loading, error, secondsLeft, importMsg, importing, fileRef,
    choose, toggleSeq, setOpen, submit, reset, onImportFile, fmtTime,
  } = useQuiz()

  const [showImport, setShowImport] = useState(false)

  if (result) {
    const passed = result.score >= 60
    return (
      <div>
        <h1 className="page-title">自测结果</h1>
        <div className="card" style={{ maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="stat-card" data-level={passed ? 'low' : 'high'} style={{ padding: 10, borderRadius: 14, textAlign: 'center', minWidth: 110 }}>
              <div className="stat-num" style={{ color: passed ? 'var(--green)' : 'var(--red)' }}>{result.score}</div>
              <div className="muted" style={{ fontSize: 12 }}>分</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{passed ? '🎉 恭喜通过' : '⚠️ 未达标'}</div>
              <div className="muted">正确 {result.correct} / 共 {result.total} 题</div>
            </div>
          </div>

          {result.ai_comments?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3 className="section-title"><span className="dot" />AI 批改（开放题练习）</h3>
              {result.ai_comments.map((c, i) => (
                <div key={i} className="card" style={{ marginTop: 8, padding: 12, background: 'var(--bg)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.question}</div>
                  <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.7 }}>{c.comment}</div>
                </div>
              ))}
            </div>
          )}

          {result.wrong_items?.length > 0 && (
            <>
              <DualCheckBadge passed={false} summary="存在错题，请查看解析并巩固" />
              {result.wrong_items.map((w, i) => (
                <div key={i} className="card" style={{ marginTop: 10, padding: 14, background: 'var(--bg)' }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{w.question}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>你的答案：{w.your_answer}（错误）</div>
                  <div style={{ fontSize: 13, marginTop: 2, color: 'var(--green)' }}>正确答案：{w.correct_answer}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>解析：{w.analysis}</div>
                </div>
              ))}
            </>
          )}
          <button className="btn" style={{ marginTop: 16 }} onClick={reset}>重新自测</button>
        </div>
      </div>
    )
  }

  // 按题型渲染作答区
  const renderAnswer = (q, qi) => {
    const qt = q.qtype || 'choice'
    if (qt === 'open') {
      return (
        <textarea className="input" rows={3} style={{ width: '100%' }} placeholder="用自己的话描述操作要点…"
          value={answers[qi] || ''} onChange={(e) => setOpen(qi, e.target.value)} />
      )
    }
    if (qt === 'sequence') {
      const sel = Array.isArray(answers[qi]) ? answers[qi] : []
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.options.map((opt, oi) => {
            const pos = sel.indexOf(oi)
            const active = pos >= 0
            return (
              <button key={oi} type="button" className={`option ${active ? 'selected' : ''}`}
                onClick={() => toggleSeq(qi, oi)} style={{ textAlign: 'left', cursor: 'pointer' }}>
                <span className="step-badge" style={{ background: active ? 'var(--primary)' : 'var(--border)', color: active ? '#fff' : 'inherit' }}>{active ? pos + 1 : '+'}</span>
                {opt}
              </button>
            )
          })}
          <div className="muted" style={{ fontSize: 12 }}>点击步骤按正确顺序依次选中，再次点击可取消。当前顺序：{sel.length ? sel.map((i) => q.options[i]).join(' → ') : '（未排）'}</div>
        </div>
      )
    }
    // choice / judge
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((opt, oi) => (
          <label key={oi} className={`option ${answers[qi] === oi ? 'selected' : ''}`}>
            <input type="radio" name={`q-${q.id}`} checked={answers[qi] === oi} onChange={() => choose(qi, oi)} />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>自测避错考试</h1>
        {questions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge">⏱️ {fmtTime(secondsLeft)}</span>
            <span className="muted" style={{ fontSize: 12 }}>{sceneName} · {questions.length} 题</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-outline chip-btn" onClick={() => setShowImport(!showImport)} style={{ marginLeft: 'auto' }}>
          📥 导入题目
        </button>
      </div>

      {showImport && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14 }}>📥 导入自定义题目</strong>
            <a className="dl-link" href={`/api/v1/quiz/template?fmt=json&token=${encodeURIComponent(token || '')}`} onClick={(e) => { e.preventDefault(); window.open(`/api/v1/quiz/template?fmt=json&token=${encodeURIComponent(token || '')}`, '_blank') }}>JSON 模板</a>
            <a className="dl-link" href={`/api/v1/quiz/template?fmt=txt&token=${encodeURIComponent(token || '')}`} onClick={(e) => { e.preventDefault(); window.open(`/api/v1/quiz/template?fmt=txt&token=${encodeURIComponent(token || '')}`, '_blank') }}>TXT 模板</a>
            <input ref={fileRef} type="file" accept=".json,.txt" style={{ display: 'none' }} onChange={onImportFile} />
            <button className="btn chip-btn" disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? <><span className="spinner" /> 导入中…</> : '选择文件（JSON/TXT）'}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            支持 JSON 和 TXT 两种格式。TXT 用 # 分隔题目，字段用「场景：/题干：/选项：/答案：/解析：」，选项用 | 分隔。
          </div>
          {importMsg && <pre className="alert alert-info" style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>{importMsg}</pre>}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {questions.length === 0 && !error && (
        <div className="card"><div className="skeleton" style={{ height: 80, marginBottom: 8 }} /><div className="skeleton" style={{ height: 80, marginBottom: 8 }} /><div className="skeleton" style={{ height: 80 }} /></div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {questions.map((q, qi) => (
          <div className="card" key={q.id}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <span className="step-badge">{qi + 1}</span>
              <strong style={{ fontSize: 14, lineHeight: 1.5, flex: 1 }}>{q.question}</strong>
              <span className="chip-btn" style={{ fontSize: 11, background: 'var(--primary-bg)' }}>{QTYPE_LABEL[q.qtype] || '单选'}</span>
            </div>
            {renderAnswer(q, qi)}
          </div>
        ))}
      </div>
      {questions.length > 0 && (
        <button className="btn" style={{ marginTop: 16 }} onClick={submit} disabled={loading}>
          {loading ? <><span className="spinner" /> 提交判分中…</> : '✅ 提交答卷'}
        </button>
      )}
    </div>
  )
}
