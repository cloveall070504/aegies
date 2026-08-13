import { useEffect, useState } from 'react'
import { getQuestions, submitQuiz } from '../../api'
import DualCheckBadge from '../../components/DualCheckBadge'

export default function Quiz() {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
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

  const choose = (qi, oi) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[qi] = oi
      return next
    })
  }

  const submit = async () => {
    if (answers.some((a) => a === -1)) {
      setError('请完成所有题目后再提交')
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
      <div>
        <h1 className="page-title">自测结果</h1>
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: result.score >= 60 ? 'var(--green)' : 'var(--red)' }}>
            {result.score} 分
          </div>
          <div className="muted" style={{ margin: '4px 0 12px' }}>正确 {result.correct} / 共 {result.total} 题</div>
          {result.wrong_items?.length > 0 && (
            <>
              <DualCheckBadge passed={false} summary="存在错题，请查看解析并巩固" />
              {result.wrong_items.map((w, i) => (
                <div key={i} style={{ marginTop: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{w.question}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>你的答案：{w.your_answer}（错误）</div>
                  <div style={{ fontSize: 13, marginTop: 2, color: 'var(--green)' }}>正确答案：{w.correct_answer}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>解析：{w.analysis}</div>
                </div>
              ))}
            </>
          )}
          <button className="btn" style={{ marginTop: 16 }} onClick={() => { setResult(null); setAnswers(new Array(questions.length).fill(-1)) }}>
            重新自测
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">自测避错考试</h1>
      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {questions.map((q, qi) => (
          <div className="card" key={q.id}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <span className="tag" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>{qi + 1}</span>
              <strong style={{ fontSize: 14 }}>{q.question}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt, oi) => (
                <label
                  key={oi}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                    background: answers[qi] === oi ? 'var(--primary-weak)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[qi] === oi}
                    onChange={() => choose(qi, oi)}
                    style={{ marginRight: 8 }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {questions.length > 0 && (
        <button className="btn" style={{ marginTop: 16 }} onClick={submit} disabled={loading}>
          {loading ? '提交判分中…' : '提交答卷'}
        </button>
      )}
    </div>
  )
}
