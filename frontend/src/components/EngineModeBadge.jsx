import { useEngineStatus, refreshEngineStatus } from '../hooks/useEngineStatus'

/**
 * 引擎模式标识 —— 消除「名不副实」的核心可见组件。
 *
 * variant:
 *  - 'chip'   ：侧边栏底部常驻的紧凑徽章（全局可见）
 *  - 'banner' ：沙盘等页面顶部的说明横幅（含启用指引）
 */
export default function EngineModeBadge({ variant = 'chip' }) {
  const { status } = useEngineStatus()
  if (!status) return null

  const isAI = status.mode === 'ai'

  if (variant === 'chip') {
    return (
      <div
        className={`engine-chip ${isAI ? 'is-ai' : 'is-rule'}`}
        title={
          isAI
            ? `AI 增强模式 · ${status.model} 在线：${status.reason}`
            : `规则模式（本地模型未连接）：${status.reason}`
        }
      >
        <span className="engine-dot" />
        <span className="engine-chip-text">
          {isAI ? `🤖 AI 增强` : `⚙️ 规则模式`}
        </span>
      </div>
    )
  }

  // banner
  return (
    <div className={`engine-banner ${isAI ? 'is-ai' : 'is-rule'}`}>
      <div className="engine-banner-head">
        <span className="engine-dot" />
        <strong>{isAI ? `AI 增强模式 · ${status.model} 在线` : '规则模式 · 本地模型未连接'}</strong>
        <button
          className="btn-ghost-xs"
          onClick={() => refreshEngineStatus()}
          title="重新探测 AI 引擎状态"
        >刷新</button>
      </div>
      <p className="engine-banner-reason">{status.reason}</p>
      {!isAI && (
        <details className="engine-howto">
          <summary>如何启用 AI 增强模式？</summary>
          <ol>
            <li>安装 Ollama：<code>winget install Ollama.Ollama</code>（或访问 ollama.com 下载）</li>
            <li>拉取模型：<code>ollama pull {status.model}</code></li>
            <li>确保后端 <code>ENABLE_OLLAMA=true</code> 并重启后端，本标识会自动切换为「AI 增强模式」。</li>
          </ol>
          <p className="muted">说明：当前规则模式下，风险判定由确定性规则引擎完成（可离线、稳定、可解释），仅缺少 AI 生成的自然语言旁白；这不影响避错沙盘、风险扫描等全部核心功能。</p>
        </details>
      )}
    </div>
  )
}
