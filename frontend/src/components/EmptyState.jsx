/**
 * 统一空态组件：列表无数据 / 搜索无结果 / 加载完成但为空时复用，
 * 避免各页面各写一套「暂无数据」文案与样式，保证体验一致。
 */
export default function EmptyState({ icon = '📭', title = '暂无数据', hint, action }) {
  return (
    <div
      className="empty-state"
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        color: 'var(--muted)',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.6 }}>{hint}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
