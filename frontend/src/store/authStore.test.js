import { describe, it, expect, beforeEach } from 'vitest'
import useAuthStore from '../store/authStore'

// 构造一个可被 authStore.parseRoleFromToken 解析的伪 JWT（仅 payload 段需可被 atob 解码）。
function fakeToken(payload) {
  return 'h.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.s'
}

beforeEach(() => useAuthStore.getState().logout())

describe('authStore', () => {
  it('setAuth 在 user 缺 role 时从 token 推导 role', () => {
    useAuthStore.getState().setAuth(fakeToken({ role: 'teacher' }), null)
    expect(useAuthStore.getState().user).toEqual({ role: 'teacher' })
    expect(useAuthStore.getState().token).toContain('h.')
  })

  it('setAuth 把 token 中的 role 合并进传入的 user', () => {
    useAuthStore.getState().setAuth(fakeToken({ role: 'admin' }), { name: 'A' })
    expect(useAuthStore.getState().user).toEqual({ name: 'A', role: 'admin' })
  })

  it('logout 清空 token 与 user', () => {
    useAuthStore.getState().setAuth(fakeToken({ role: 'student' }), { role: 'student' })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().token).toBe('')
    expect(useAuthStore.getState().user).toBeNull()
  })
})
