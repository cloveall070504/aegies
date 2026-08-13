import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  timeout: 60000,
})

// 请求拦截：附加 JWT 与终端类型
client.interceptors.request.use((config) => {
  const raw = localStorage.getItem('ai-avoid-auth')
  let token = ''
  try {
    token = raw ? JSON.parse(raw).state?.token || '' : ''
  } catch {
    token = ''
  }
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
  (err) => {
    const msg = err.response?.data?.message || err.message || '网络错误'
    return Promise.reject(new Error(msg))
  },
)

export default client
