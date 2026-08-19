import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 从 JWT 解析 role（不校验签名，仅取 payload）。后端 create_access_token 把 role 写进了 token，
// 这是角色最权威的来源，可兜底 user 对象缺失/陈旧 role 的情况。
function parseRoleFromToken(token) {
  if (!token || typeof token !== 'string') return ''
  try {
    const seg = token.split('.')[1]
    if (!seg) return ''
    const json = JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/')))
    return json.role || ''
  } catch {
    return ''
  }
}

const useAuthStore = create(
  persist(
    (set) => ({
      token: '',
      user: null,
      setAuth: (token, user) => {
        const fromToken = parseRoleFromToken(token)
        const mergedUser = user
          ? { ...user, role: user.role || fromToken }
          : fromToken
            ? { role: fromToken }
            : null
        set({ token, user: mergedUser })
      },
      setUser: (user) => set({ user }),
      logout: () => set({ token: '', user: null }),
    }),
    { name: 'ai-avoid-auth' },
  ),
)

export default useAuthStore
