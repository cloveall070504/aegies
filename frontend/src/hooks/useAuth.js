import { useMemo } from 'react'
import useAuthStore from '../store/authStore'

export function useAuth() {
  const { token, user, setAuth, setUser, logout } = useAuthStore()
  return useMemo(
    () => ({ token, user, setAuth, setUser, logout, isAuthed: Boolean(token) }),
    [token, user, setAuth, setUser, logout],
  )
}
