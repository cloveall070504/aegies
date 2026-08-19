export default function DualCheckBadge({ passed = true, summary = '', verifiedBy = '', divergence = false }) {
  // 诚实标注（三态）：
  //  - 绿：规则引擎确定性通过（无分歧）
  //  - 黄：AI 双智能体自检通过，但模型 Critic 与规则引擎存在分歧，已以规则引擎为准（仅提示，不算不通过）
  //  - 红：规则自检发现硬伤（等级不一致/虚构条款/遗漏高危关键词），确为「未通过」
  let title
  let tone // 'green' | 'yellow' | 'red'
  if (!passed) {
    tone = 'red'
    title = verifiedBy === 'rule_engine' ? '规则引擎判定需复核' : 'AI 自检未通过'
  } else if (divergence) {
    tone = 'yellow'
    title = 'AI 自检存在分歧（已以规则引擎为准）'
  } else {
    tone = 'green'
    title = verifiedBy === 'rule_engine' ? '规则引擎确定性判定通过' : 'AI 双智能体自检通过'
  }
  const icon = tone === 'green' ? '✓' : tone === 'yellow' ? '△' : '!'
  return (
    <div className="dual-check" data-tone={tone} role="status" aria-live="polite">
      <span className="dual-check__icon" aria-hidden="true">{icon}</span>
      <div className="dual-check__body">
        <strong className="dual-check__title">{title}</strong>
        {summary && <p className="dual-check__summary muted">{summary}</p>}
      </div>
    </div>
  )
}
