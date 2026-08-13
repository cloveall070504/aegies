import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set) => ({
      token: '',
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: '', user: null }),
    }),
    { name: 'ai-avoid-auth' },
  ),
)

export default useAuthStore
