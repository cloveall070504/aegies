import { useState } from 'react'
import { useSceneName } from '../../hooks/useSceneType'
import useAuthStore from '../../store/authStore'
import { useQuiz } from '../../hooks/useQuiz'

export default function MobileQuiz() {
  const sceneName = useSceneName()
  const token = useAuthStore((s) => s.token)
  const {
    questions, answers, result, loading, error, secondsLeft, importMsg, importing, fileRef,
    choose, submit, reset, onImportFile, fmtTime,
  } = useQuiz()
  const [idx, setIdx] = useState(0)
  const [showImport, setShowImport] = useState(false)

  if (result) {
    const passed = result.score >= 60
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="stat-card" data-level={passed ? 'low' : 'high'} style={{ padding: 14, borderRadius: 14, marginBottom: 10 }}>
          <div className="stat-num" style={{ color: passed ? 'var(--green)' : 'var(--red)' }}>{result.score}</div>
          <div className="muted" style={{ fontSize: 12 }}>分</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{passed ? '🎉 恭喜通过' : '⚠️ 未达标'}</div>
        <div className="muted" style={{ margin: '6px 0 14px' }}>正确 {result.correct}/{result.total}</div>
        <button className="btn" onClick={reset}>重新自测</button>
      </div>
    )
  }

  if (questions.length === 0) {
    return error ? <div className="alert alert-error">{error}</div> : <div className="card"><div className="skeleton" style={{ height: 100 }} /></div>
  }

  const q = questions[idx]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>自测 · 单题模式</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="badge" style={{ color: secondsLeft < 60 ? 'var(--red)' : undefined }}>⏱️ {fmtTime(secondsLeft)}</span>
          <span className="badge">{idx + 1} / {questions.length}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: 12, cursor: 'pointer' }} onClick={() => setShowImport(!showImport)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>📥 导入自定义题目</span>
          <span style={{ color: 'var(--primary)' }}>{showImport ? '收起 ▲' : '展开 ▼'}</span>
        </div>
      </div>

      {showImport && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            支持 JSON / TXT 格式。TXT 用 # 分隔题目，字段用「场景：/题干：/选项：/答案：/解析：」，选项用 | 分隔。
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <a className="dl-link" style={{ fontSize: 13 }} href={`/api/v1/quiz/template?fmt=json&token=${encodeURIComponent(token || '')}`} onClick={(e) => { e.preventDefault(); window.open(`/api/v1/quiz/template?fmt=json&token=${encodeURIComponent(token || '')}`, '_blank') }}>📄 JSON 模板</a>
            <a className="dl-link" style={{ fontSize: 13 }} href={`/api/v1/quiz/template?fmt=txt&token=${encodeURIComponent(token || '')}`} onClick={(e) => { e.preventDefault(); window.open(`/api/v1/quiz/template?fmt=txt&token=${encodeURIComponent(token || '')}`, '_blank') }}>📄 TXT 模板</a>
          </div>
          <input ref={fileRef} type="file" accept=".json,.txt" style={{ display: 'none' }} onChange={onImportFile} />
          <button className="btn" disabled={importing} onClick={() => fileRef.current?.click()} style={{ width: '100%' }}>
            {importing ? <><span className="spinner" /> 导入中…</> : '选择文件导入（JSON/TXT）'}
          </button>
          {importMsg && <div className="alert alert-info" style={{ marginTop: 8, fontSize: 12 }}>{importMsg}</div>}
        </div>
      )}

      <div className="progress" style={{ marginBottom: 14 }}>
        <span style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <span className="step-badge">{idx + 1}</span>
          <strong style={{ fontSize: 15, lineHeight: 1.5 }}>{q.question}</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {q.options.map((opt, oi) => (
            <label key={oi} className={`option ${answers[idx] === oi ? 'selected' : ''}`}>
              <input type="radio" name="mq" checked={answers[idx] === oi} onChange={() => choose(idx, oi)} />
              {opt}
            </label>
          ))}
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn-outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)} style={{ flex: 1 }}>上一题</button>
          {idx < questions.length - 1 ? (
            <button className="btn" onClick={() => setIdx(idx + 1)} style={{ flex: 1 }}>下一题</button>
          ) : (
            <button className="btn" onClick={submit} disabled={loading} style={{ flex: 1 }}>
              {loading ? <><span className="spinner" /> 提交中…</> : '提交'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
