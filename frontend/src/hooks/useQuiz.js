/**
 * 共享考试逻辑 hook（PC / Mobile 通用）
 * 负责：加载题目、倒计时、选答、提交判分、导入题目、重置。
 * PC/Mobile 页面只负责把状态渲染成不同布局。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getQuestions, submitQuiz, importQuiz } from '../api'
import { useSceneCode } from './useSceneType'

export const QUIZ_TIME_LIMIT = 300 // 5 分钟

export function useQuiz() {
  const sceneCode = useSceneCode()
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(QUIZ_TIME_LIMIT)
  const [importMsg, setImportMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  const reload = useCallback(() => {
    getQuestions('experiment', sceneCode)
      .then((data) => {
        setQuestions(data.questions || [])
        setAnswers((data.questions || []).map((q) => (q.qtype === 'sequence' ? [] : (q.qtype === 'open' ? '' : -1))))
        setSecondsLeft(QUIZ_TIME_LIMIT)
      })
      .catch((e) => setError(e.message))
  }, [sceneCode])

  useEffect(() => {
    setQuestions([])
    setResult(null)
    setError('')
    reload()
  }, [reload])

  // 倒计时：到 0 自动交卷
  useEffect(() => {
    if (result || questions.length === 0) return
    if (secondsLeft <= 0) {
      submit(true)
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, result, questions])

  const choose = useCallback((qi, oi) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[qi] = oi
      return next
    })
  }, [])

  // 排序题：点击步骤切换其是否在正确顺序中（在则移除，不在则追加到末尾）
  const toggleSeq = useCallback((qi, oi) => {
    setAnswers((prev) => {
      const next = [...prev]
      const arr = Array.isArray(next[qi]) ? [...next[qi]] : []
      const idx = arr.indexOf(oi)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(oi)
      next[qi] = arr
      return next
    })
  }, [])

  // 开放题：记录学生文本作答
  const setOpen = useCallback((qi, text) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[qi] = text
      return next
    })
  }, [])

  const submit = useCallback(
    async (force = false) => {
      if (!force && answers.some((a) => a === -1)) {
        setError('请完成所有题目后再提交')
        return
      }
      setLoading(true)
      setError('')
      try {
        const data = await submitQuiz(answers, 'experiment', sceneCode, 'practice')
        setResult(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [answers, sceneCode],
  )

  const reset = useCallback(() => {
    setResult(null)
    setAnswers(questions.map((q) => (q.qtype === 'sequence' ? [] : (q.qtype === 'open' ? '' : -1))))
    setSecondsLeft(QUIZ_TIME_LIMIT)
    setError('')
  }, [questions.length])

  const onImportFile = useCallback(
    async (e) => {
      const f = e.target.files?.[0]
      if (!f) return
      setImporting(true)
      setImportMsg('')
      try {
        const r = await importQuiz(f)
        setImportMsg(`✅ ${r.message}（共 ${r.total_imported} 道导入题目）`)
        if (r.errors?.length) {
          setImportMsg((prev) => prev + `\n⚠️ 失败项：\n${r.errors.join('\n')}`)
        }
        reload()
      } catch (err) {
        setImportMsg(`❌ 导入失败：${err.message}`)
      } finally {
        setImporting(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [reload],
  )

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return {
    // state
    questions, answers, result, loading, error, secondsLeft, importMsg, importing, fileRef,
    // actions
    choose, toggleSeq, setOpen, submit, reset, onImportFile, reload, fmtTime,
    // constants
    QUIZ_TIME_LIMIT,
  }
}
