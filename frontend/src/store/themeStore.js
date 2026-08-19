import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 主题：'dark'（暗色赛博指挥台，默认）/ 'light'（浅色科技变体）
const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      // 仅接受 dark/light；场景 theme_name（student/worker 等）不再驱动全局主题
      setTheme: (theme) => {
        if (theme === 'dark' || theme === 'light') set({ theme })
      },
    }),
    { name: 'ai-avoid-theme' },
  ),
)

export default useThemeStore
