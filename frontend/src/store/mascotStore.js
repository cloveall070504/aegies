import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 公仔（安全向导 · 火柴人）状态：手动动作 + 沙盘联动情绪
// action: 用户手动触发的趣味动作（待机/喝茶/打坐/挠头/钓鱼/打拳）
// mood:   沙盘联动情绪（neutral 中性 / alert 危险警示 / safe 安全赞许）
//         情绪优先于 action 展示，离开沙盘或一段时间无联动后回落到 action
export const useMascotStore = create(
  persist(
    (set, get) => ({
      action: 'idle',
      mood: 'neutral',
      moodExpireAt: 0, // 联动情绪的过期时间戳（ms）；过期后回落到 action

      setAction: (action) => set({ action, mood: 'neutral', moodExpireAt: 0 }),
      setMood: (mood, ttlMs = 6000) => set({ mood, moodExpireAt: Date.now() + ttlMs }),
      clearMoodIfExpired: () => {
        const { mood, moodExpireAt } = get()
        if (mood !== 'neutral' && moodExpireAt && Date.now() > moodExpireAt) {
          set({ mood: 'neutral', moodExpireAt: 0 })
        }
      },
    }),
    { name: 'ai-avoid-mascot', partialize: (s) => ({ action: s.action }) },
  ),
)

// 沙盘风险等级 → 联动情绪
export function moodFromLevel(level) {
  if (level === 'high' || level === 'critical') return 'alert'
  if (level === 'none' || level === 'safe') return 'safe'
  return 'neutral'
}
