import { useEffect, useRef, useState, useCallback } from 'react'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { askCompanion } from '../utils/companionAsk'
import { companionAsr } from '../api/asr'

/**
 * 语音输入（学生端数字人主页）。
 *
 * 交互：点麦克风 → 请求麦克风权限 → 录音（最长 30s）→ 再点停止 → 上传后端 /companion/asr
 * （DashScope Paraformer 转写）→ 拿到文字 → 走 /companion/chat 统一意图分流。
 *
 * 为什么不用浏览器原生 Web Speech API：
 *   它的识别后端是谷歌云端，国内网络连不通，表现为"录音在跑但永远吐不出字"，且不报错。
 *   改成本地录音 + 后端转发 DashScope，复用现有云端密钥，国内可用。
 *
 * 打断式交互：数字人正在说话时点击麦克风，先停语音再开始听。
 */
const MAX_MS = 30000

export default function VoiceInput({ module = '' }) {
  const { speaking, hush } = useDigitalHumanStore()
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [supported, setSupported] = useState(true)
  const [denied, setDenied] = useState(false)

  const mediaRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => {
    const ok = !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      typeof window.MediaRecorder !== 'undefined'
    )
    setSupported(ok)
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const upload = async (blob) => {
    setRecording(false)
    setUploading(true)
    // 打断数字人正在说的话，准备播报识别后的回复
    hush()
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    try {
      const res = await companionAsr(blob)
      const text = (res?.text || '').trim()
      if (!text) {
        useDigitalHumanStore.getState().speak('我没听清，能再说一遍吗？或者直接打字告诉我。', { expression: 'thinking', ms: 4000 })
        return
      }
      await askCompanion(text, { module })
    } catch (e) {
      const msg = (e && e.message) || ''
      if (msg.includes('不可用') || msg.includes('密钥')) {
        useDigitalHumanStore.getState().speak('当前环境语音识别不可用，你直接打字问我也可以。', { expression: 'thinking', ms: 4000 })
      } else {
        useDigitalHumanStore.getState().speak('语音识别这会儿不太顺，你直接打字问我也行。', { expression: 'thinking', ms: 4000 })
      }
    } finally {
      setUploading(false)
    }
  }

  const start = async () => {
    // 打断式交互：点下麦克风立即停掉数字人正在说的话（注释说要做，原来只在上传时才 hush）
    hush()
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setDenied(false)
      const mr = new MediaRecorder(stream)
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stopStream()
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (!blob.size) {
          setRecording(false)
          return
        }
        await upload(blob)
      }
      mr.start()
      setRecording(true)
      timerRef.current = setTimeout(() => {
        if (mediaRef.current && mediaRef.current.state === 'recording') mediaRef.current.stop()
      }, MAX_MS)
    } catch (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setDenied(true)
        useDigitalHumanStore.getState().speak('我没有拿到麦克风权限，请在浏览器地址栏允许麦克风后重试，或者直接打字问我。', { expression: 'thinking', ms: 5000 })
      } else {
        useDigitalHumanStore.getState().speak('麦克风打不开，你可以直接打字问我。', { expression: 'thinking', ms: 4000 })
      }
    }
  }

  const stop = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (mediaRef.current && mediaRef.current.state === 'recording') mediaRef.current.stop()
    // onstop 会触发上传
  }

  const toggle = useCallback(() => {
    if (uploading) return
    if (recording) stop()
    else start()
  }, [recording, uploading])

  if (!supported) {
    return (
      <div className="voice-input">
        <div className="vi-btn vi-btn--disabled" aria-disabled="true">
          <svg viewBox="0 0 24 24" className="vi-mic" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" strokeLinejoin="round" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" />
            <path d="M12 19v3" strokeLinecap="round" />
          </svg>
        </div>
        <span className="vi-label">当前浏览器不支持录音，请直接打字</span>
      </div>
    )
  }

  return (
    <div className="voice-input">
      <button
        type="button"
        className={`vi-btn${recording ? ' vi-btn--rec' : ''}${uploading ? ' vi-btn--proc' : ''}`}
        onClick={toggle}
        disabled={uploading}
        aria-label={recording ? '停止录音' : '语音输入'}
      >
        {uploading ? (
          <span className="vi-spinner" />
        ) : recording ? (
          <span className="vi-wave">
            <span /><span /><span /><span /><span />
          </span>
        ) : (
          <svg viewBox="0 0 24 24" className="vi-mic" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" strokeLinejoin="round" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" />
            <path d="M12 19v3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span className="vi-label">
        {uploading
          ? '识别中…'
          : recording
            ? '正在聆听，说完再点一下'
            : denied
              ? '麦克风被拒绝，允许后重试'
              : '语音输入 · 可提问'}
      </span>
    </div>
  )
}
