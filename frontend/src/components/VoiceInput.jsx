import { useEffect, useRef, useState, useCallback } from 'react'
import useDigitalHumanStore from '../store/digitalHumanStore'
import { askCompanion } from '../utils/companionAsk'

/**
 * 语音输入（学生端数字人主页）。
 *
 * 对应《数字人深度融合方案》"交互方式升级 · 自由对话模式"：
 * 旧版只能做"操作识别"（直接调规则引擎）；现在语音也走 /companion/chat，
 * 由后端意图识别分流——说操作给判定，提问给讲解（RAG+LLM），闲聊给陪伴回复。
 * 语音结果同步进 CompanionChat 气泡流，与打字输入共享同一会话上下文。
 *
 * 打断式交互：数字人正在说话时点击麦克风，先停语音再开始听。
 */
export default function VoiceInput({ module = '' }) {
  const { speaking, hush } = useDigitalHumanStore()
  const [listening, setListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [supported, setSupported] = useState(true)
  const recRef = useRef(null)

  // 初始化 SpeechRecognition
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setSupported(false); return }

    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onresult = async (e) => {
      const text = e.results[0][0].transcript.trim()
      setListening(false)
      if (!text) return

      setProcessing(true)
      hush()
      // 统一入口：后端意图识别（操作判定 / 自由问答 / 闲聊）
      await askCompanion(text, { module })
      setProcessing(false)
    }

    rec.onerror = (e) => {
      setListening(false)
      setProcessing(false)
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        useDigitalHumanStore.getState().speak('语音识别出了点问题，请再试一次，或者直接打字问我。', { expression: 'thinking', ms: 4000 })
      }
    }

    rec.onend = () => {
      setListening(false)
    }

    recRef.current = rec

    return () => { try { rec.abort() } catch {} }
  }, [hush, module])

  const toggle = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      if (speaking) {
        // 打断式交互：数字人正在说话时，先停掉再听
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        hush()
      }
      try {
        rec.start()
        setListening(true)
      } catch {
        // start 可能抛错（已 started），忽略
      }
    }
  }, [listening, speaking, hush])

  if (!supported) return null

  return (
    <div className="voice-input">
      <button
        type="button"
        className={`vi-btn${listening ? ' vi-btn--rec' : ''}${processing ? ' vi-btn--proc' : ''}`}
        onClick={toggle}
        disabled={processing}
        aria-label={listening ? '停止录音' : '语音输入'}
      >
        {processing ? (
          <span className="vi-spinner" />
        ) : listening ? (
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
        {processing ? '思考中…' : listening ? '说出操作或问题…' : '语音输入 · 可提问'}
      </span>
    </div>
  )
}
