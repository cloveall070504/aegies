import { useEffect, useState } from 'react'
import { getQuestions, submitQuiz } from '../../api'

export default function MobileQuiz() {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getQuestions()
      .then((data) => {
        setQuestions(data.questions || [])
        setAnswers(new Array((data.questions || []).length).fill(-1))
      })
      .catch((e) => setError(e.message))
  }, [])

  const choose = (oi) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[idx] = oi
      return next
    })
  }

  const submit = async () => {
    if (answers.some((a) => a === -1)) {
      setError('请完成所有题目')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await submitQuiz(answers)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44, fontWeight: 800, color: result.score >= 60 ? 'var(--green)' : 'var(--red)' }}>{result.score} 分</div>
        <div className="muted" style={{ margin: '6px 0 14px' }}>正确 {result.correct}/{result.total}</div>
        <button className="btn" onClick={() => { setResult(null); setIdx(0); setAnswers(new Array(questions.length).fill(-1)) }}>重新自测</button>
      </div>
    )
  }

  if (questions.length === 0) {
    return error ? <div className="card" style={{ color: 'var(--red)' }}>{error}</div> : <div className="muted">加载中…</div>
  }

  const q = questions[idx]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>自测 · 单题模式</h2>
        <span className="muted">{idx + 1} / {questions.length}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--primary)', width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>
      <div className="card">
        <strong style={{ fontSize: 15 }}>{q.question}</strong>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {q.options.map((opt, oi) => (
            <label
              key={oi}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                background: answers[idx] === oi ? 'var(--primary-weak)' : 'transparent',
              }}
            >
              <input type="radio" name="mq" checked={answers[idx] === oi} onChange={() => choose(oi)} style={{ marginRight: 8 }} />
              {opt}
            </label>
          ))}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn-outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)} style={{ flex: 1 }}>上一题</button>
          {idx < questions.length - 1 ? (
            <button className="btn" onClick={() => setIdx(idx + 1)} style={{ flex: 1 }}>下一题</button>
          ) : (
            <button className="btn" onClick={submit} disabled={loading} style={{ flex: 1 }}>{loading ? '提交中…' : '提交'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
