import { useRef, useState, useEffect } from 'react'
import { coachVisionCheck, coachVisionAsk } from '../api/coach'
import '../styles/coach.css'
import '../styles/coach.css'

/**
 * 摄像头视觉纠错（项12）。
 *
 * 诚实实现：当前未接入多模态视觉模型，所以"看画面"这一步由学生自己完成——
 * 摄像头实时预览让学生对照自己的操作，安全判定则基于学生描述的步骤文本，
 * 经同一套规则引擎（唯一事实源）校验，与文字/语音操作口径一致。
 * 这样既真实可用、又不会"假装能看图"误导学生。
 *
 * 后端 /vision-check 接收 frame_description（文本），返回 level / must_warn / tip。
 */
export default function VisionCorrector() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [snapshot, setSnapshot] = useState('')
  const [description, setDescription] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef(null)

  const startCamera = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraOn(true)
    } catch (e) {
      setError('无法打开摄像头：' + (e.message || '权限被拒绝'))
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  useEffect(() => () => stopCamera(), [])

  const capture = () => {
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    c.width = v.videoWidth || 320
    c.height = v.videoHeight || 240
    const ctx = c.getContext('2d')
    ctx.drawImage(v, 0, 0, c.width, c.height)
    setSnapshot(c.toDataURL('image/png'))
    if (!description) setError('拍下了当前画面。请在下方描述你正在做的这一步，再点「分析」——安全判定基于你的描述。')
  }

  const analyze = async (mode) => {
    if (!description.trim()) {
      setError('请先描述你正在做的操作（例如"我把水倒进浓硫酸里"），再点分析。')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = mode === 'ask'
        ? await coachVisionAsk({ frameDescription: description, question })
        : await coachVisionCheck({ frameDescription: description })
      setResult(res)
    } catch (e) {
      setError('分析失败：' + (e.message || '网络错误'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="vc">
      <div className="vc-head">
        <span className="vc-title">摄像头操作纠错</span>
        {!cameraOn
          ? <button type="button" className="vc-btn" onClick={startCamera}>开启摄像头</button>
          : <button type="button" className="vc-btn vc-btn--stop" onClick={stopCamera}>关闭摄像头</button>}
      </div>

      <p className="vc-note">
        摄像头用于你自己对照操作；安全判定基于你<strong>描述的步骤</strong>，经同一套规则引擎校验（与文字/语音操作一致）。
      </p>

      <div className="vc-stage">
        <video ref={videoRef} className="vc-video" playsInline muted />
        {cameraOn && <button type="button" className="vc-capture" onClick={capture}>拍下这一步</button>}
        {snapshot && <img src={snapshot} alt="操作快照" className="vc-snapshot" />}
      </div>

      <textarea
        className="vc-input"
        placeholder="描述你正在做的这一步（必填）…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <input
        className="vc-input"
        placeholder="想追问的问题（可选）…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <div className="vc-actions">
        <button type="button" className="vc-btn" disabled={loading || !cameraOn} onClick={() => analyze('check')}>分析风险</button>
        <button type="button" className="vc-btn vc-btn--ghost" disabled={loading || !cameraOn || !question.trim()} onClick={() => analyze('ask')}>带着问题问</button>
      </div>

      {error && <div className="vc-error">{error}</div>}

      {result && (
        <div className={`vc-result ${result.must_warn ? 'vc-result--warn' : 'vc-result--safe'}`}>
          {result.must_warn ? (
            <>
              <div className="vc-result__badge">检测到风险（{result.level}）</div>
              <div className="vc-result__tip">{result.tip}</div>
              {result.source_count > 0 && (
                <div className="vc-result__src">依据条款 {result.source_count} 条</div>
              )}
            </>
          ) : (
            <>
              <div className="vc-result__badge vc-result__badge--ok">这一步看起来安全</div>
              <div className="vc-result__tip">{result.tip}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
