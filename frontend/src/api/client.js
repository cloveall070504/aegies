import axios from 'axios'
import useAuthStore from '../store/authStore'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 60000,
})

// 请求拦截：附加 JWT 与终端类型
// token 从 authStore 取（而非直接读 localStorage 内部结构），与 zustand persist 解耦。
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token || ''
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Client-Type'] = window.innerWidth < 768 ? 'mobile' : 'pc'
  return config
})

// 响应拦截：统一解包 {code, message, data, timestamp}
client.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && body.code !== undefined) {
      if (body.code !== 200) return Promise.reject(new Error(body.message || '请求失败'))
      return body.data
    }
    return body
  },
  async (err) => {
    // blob 响应的错误（如报告下载越权 403）需要解析 Blob 为 JSON
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text()
        const body = JSON.parse(text)
        return Promise.reject(new Error(body.message || '请求失败'))
      } catch (_) {
        // ignore parse error
      }
    }
    const msg = err.response?.data?.message || err.message || '网络错误'
    return Promise.reject(new Error(msg))
  },
)

// 统一解包辅助：响应拦截器已将 {code,message,data} 解包为 body.data，
// 但不同接口的 data 形态不一（数组 / {list,total} / {items}），
// 历史代码因此出现 d / d.data 混写。统一走下面两个辅助，杜绝按字段名猜测；
// 新增页面也应复用，避免该一致性问题复发。
export function asList(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && Array.isArray(payload.list)) return payload.list
  if (payload && Array.isArray(payload.items)) return payload.items
  return []
}

export function asData(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return 'data' in payload ? payload.data : payload
  }
  return payload
}

export default client
