import client from './client'

export const login = (username, password) => client.post('/auth/login', { username, password })
export const register = (payload) => client.post('/auth/register', payload)
export const getMe = () => client.get('/auth/me')

// 用户管理（仅 admin）
export const listUsers = (params = {}) => client.get('/auth/users', { params })
export const createUser = (payload) => client.post('/auth/users', payload)
export const updateUser = (uid, payload) => client.put(`/auth/users/${uid}`, payload)
export const deleteUser = (uid) => client.delete(`/auth/users/${uid}`)
