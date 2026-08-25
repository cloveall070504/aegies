import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHead from '../../components/PageHead'
import { getNotifications, getReviewDue, completeReview, markNotificationRead, markAllNotificationsRead } from '../../api'
import useNotificationStore from '../../store/notificationStore'

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

export default function Notifications() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [due, setDue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = () => {
    return Promise.all([getNotifications(), getReviewDue()])
      .then(([n, r]) => {
        setItems(n.items || [])
        setUnread(n.unread_count || 0)
        useNotificationStore.getState().setUnreadCount(n.unread_count || 0)
        setDue(r.items || [])
      })
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const onCompleteReview = async (it) => {
    try {
      await completeReview(it.item_id, it.scene_code)
      await load()
    } catch (e) { setError(e.message || '操作失败') }
  }

  const onRead = async (id) => {
    try { await markNotificationRead(id); await load() } catch (e) { setError(e.message) }
  }

  const onReadAll = async () => {
    try { await markAllNotificationsRead(); await load() } catch (e) { setError(e.message) }
  }

  const onOpen = (n) => {
    if (!n.is_read) onRead(n.id)
    // 复习提醒跳转学习路径；其余按后台下发的 related_url 跳转
    const url = n.type === 'review_reminder' ? '/learning' : (n.related_url || '')
    if (url) navigate(url)
  }

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>
  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>

  return (
    <div>
      <PageHead
        eyebrow="消息中心"
        title="消息中心"
        desc="复习提醒与站内通知都会在这里汇总，红点表示还有未读"
      />

      {/* 待复习 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />待复习错题</h3>
          {due.length > 0 && <span className="badge" style={{ background: 'var(--red-bg, rgba(239,68,68,0.16))', color: 'var(--red)', border: '1px solid var(--red)' }}>{due.length} 道待巩固</span>}
        </div>
        {due.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}><div className="empty-icon">✅</div><div className="empty-text">没有到期的错题，保持得很好！</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {due.map((it) => (
              <div key={it.item_id + it.scene_code} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 12, background: 'var(--card-2, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>🔁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.question_text || '（无题干）'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>场景 {it.scene_code || '通用'} · 累计错 {it.wrong_count} 次</div>
                </div>
                <button className="btn chip-btn" onClick={() => onCompleteReview(it)}>标记已复习</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 消息列表 */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />全部消息</h3>
          {unread > 0 && <span className="badge">{unread} 条未读</span>}
          {unread > 0 && <button className="btn-outline chip-btn" style={{ marginLeft: 'auto' }} onClick={onReadAll}>全部已读</button>}
        </div>
        {items.length === 0 ? (
          <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">暂无消息</div></div>
        ) : (
          <div className="list" style={{ marginTop: 12 }}>
            {items.map((n) => (
              <div
                key={n.id}
                onClick={() => onOpen(n)}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 8px', borderRadius: 10, cursor: 'pointer', background: n.is_read ? 'transparent' : 'var(--primary-bg, rgba(34,211,238,0.08))' }}
              >
                <span style={{ fontSize: 18, lineHeight: 1.4 }}>{n.type === 'review_reminder' ? '🔔' : '📌'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 14 }}>{n.title}</strong>
                    {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--red)' }} />}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{n.content}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <button className="btn-outline chip-btn" onClick={(e) => { e.stopPropagation(); onRead(n.id) }}>标为已读</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
