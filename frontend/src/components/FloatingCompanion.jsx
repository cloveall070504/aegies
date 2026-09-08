import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useDigitalHumanStore from '../store/digitalHumanStore'
import useCompanionChatStore from '../store/companionChatStore'
import CompanionChat from './CompanionChat'
import { setCompanionStageActive } from '../utils/companionEvents'
import { stopSpeech, setVoiceUnlocked } from '../utils/speechController'
import '../styles/floating-companion.css'

/**
 * 全局悬浮数字人助手（PCLayout 页面使用）。
 *
 * 解决问题：独立路由页（/sandbox、/cases、/profile 等）没有数字人舞台，
 * 所有 notify* 主动发言都被 stageActive 拦截，数字人完全"失声"。
 *
 * 功能：
 *  1. 挂载时激活 stageActive → 所有 notify* 恢复工作
 *  2. 右下角悬浮球，点击展开对话面板
 *  3. 收起状态下数字人说话时弹气泡提示
 *  4. 语音由 speechController 单路播放（避免与 DigitalHumanStage 唱双簧）
 *  5. 静音开关（只听字幕 / 听语音）
 *  6. 根据当前路由自动设置模块上下文
 */

// 路由路径 → 模块名映射（给 companion 对话做场景上下文）
const PATH_MODULE_MAP = {
  '/sandbox': '避错沙盘',
  '/cases': '案例库',
  '/profile': '个人画像',
  '/docs': '文档管理',
  '/assignments': '我的作业',
  '/training': '学习中心',
  '/sim': '分步骤培训',
  '/dashboard': '我的主页',
}

function moduleFromPath(pathname) {
  for (const prefix of Object.keys(PATH_MODULE_MAP)) {
    if (pathname.startsWith(prefix)) return PATH_MODULE_MAP[prefix]
  }
  return ''
}

const EXPR_LABEL = {
  neutral: '数字人',
  calm: '平静',
  happy: '开心',
  alert: '⚠️ 注意',
  thinking: '思考中',
  focus: '专注',
  approve: '👍 不错',
  surprised: '😮 惊讶',
}

export default function FloatingCompanion() {
  const location = useLocation()
  const { caption, speaking, expression, muted, toggleMuted, hush } = useDigitalHumanStore()
  const { messages } = useCompanionChatStore()
  const [open, setOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const toastTimerRef = useRef(null)

  // 1) 激活数字人舞台：让所有 notify* 恢复工作
  useEffect(() => {
    setCompanionStageActive(true)
    return () => setCompanionStageActive(false)
  }, [])

  // 1.5) 全局静音变化时，立刻停止当前播放（store 已处理，这里兜底）
  useEffect(() => {
    if (!muted) return
    stopSpeech()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel() } catch (_) {}
    }
  }, [muted])

  // 2) 浏览器自动播放限制：首次交互后解锁
  useEffect(() => {
    const unlock = () => {
      setVoiceUnlocked(true)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // 3) 字幕变化 → 仅控制收起态气泡提示；语音由 speechController 单路播放（避免唱双簧）
  useEffect(() => {
    if (!caption) {
      setShowToast(false)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      return
    }
    if (!open) {
      setShowToast(true)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      // 气泡显示时长：按字数估算，最长 8 秒
      const dur = Math.min(8000, 2500 + caption.length * 120)
      toastTimerRef.current = setTimeout(() => setShowToast(false), dur)
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [caption, open])

  // 展开面板时隐藏气泡
  useEffect(() => {
    if (open) setShowToast(false)
  }, [open])

  // 点击悬浮球
  const onFabClick = () => {
    setOpen((v) => !v)
  }

  // 点击气泡 → 展开面板
  const onToastClick = () => {
    setOpen(true)
    setShowToast(false)
  }

  // 切换静音（全局状态，两边同步）
  const toggleMute = (e) => {
    e.stopPropagation()
    const next = !muted
    toggleMuted()
    if (next) {
      // 立刻静音：停掉当前播放
      stopSpeech()
      hush()
    }
  }

  // 未读消息数（只在收起状态显示小红点）
  const unread = messages.length > 0 && !open ? messages.length : 0

  return (
    <div className="fc">
      {/* 气泡提示 */}
      {showToast && caption && (
        <div className="fc-toast" onClick={onToastClick}>
          {expression && expression !== 'neutral' && (
            <div className="fc-toast__expr">{EXPR_LABEL[expression] || '数字人'}</div>
          )}
          {caption.length > 80 ? caption.slice(0, 80) + '…' : caption}
        </div>
      )}

      {/* 对话面板 */}
      {open && (
        <div className="fc-panel">
          <CompanionChat
            module={moduleFromPath(location.pathname)}
            open={open}
            onOpenChange={setOpen}
            showFab={false}
          />
        </div>
      )}

      {/* 悬浮球 */}
      <div
        className={`fc-fab${speaking ? ' speaking' : ''}`}
        onClick={onFabClick}
        title={muted ? '数字人助手（已静音）' : '数字人助手 · 点击对话'}
        role="button"
        aria-label="打开数字人对话"
      >
        <span role="img" aria-hidden>🤖</span>
        {unread > 0 && !open && (
          <span className="fc-fab__badge">{unread > 9 ? '9+' : unread}</span>
        )}
        {/* 静音按钮 */}
        <button
          type="button"
          className={`fc-mute${muted ? ' muted' : ''}`}
          onClick={toggleMute}
          title={muted ? '取消静音' : '静音'}
          aria-label={muted ? '取消静音' : '静音'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </div>
  )
}
