import { create } from 'zustand'
import { getNotifications } from '../api'

// 全局未读消息数：让顶部铃铛红点与消息中心页面共享同一数据源，
// 在消息中心标记已读后能实时刷新，无需整页刷新。
const useNotificationStore = create((set) => ({
  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: Math.max(0, Number(n) || 0) }),
  // 主动从后端拉取最新未读数（登录后 / 路由切换时调用）
  refresh: async () => {
    try {
      const d = await getNotifications()
      set({ unreadCount: Math.max(0, Number(d?.unread_count) || 0) })
    } catch {
      // 网络/鉴权失败时不改变已有计数，避免误清零
    }
  },
}))

export default useNotificationStore
