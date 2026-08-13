import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useThemeStore = create(
  persist(
    (set) => ({
      theme: 'student', // student(蓝白) | worker(深色工业风)
      toggleTheme: () => set((s) => ({ theme: s.theme === 'student' ? 'worker' : 'student' })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'ai-avoid-theme' },
  ),
)

export default useThemeStore
