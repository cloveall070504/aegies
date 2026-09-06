import client from './client'

/**
 * 数字人相关接口。
 * 说明：baseURL 已是 /api/v1，且响应拦截器已解包 {code,message,data} → data。
 * 这里全部做静默降级：LiveTalking 未部署 / 后端未升级时返回不可用，页面自动回落到光形占位。
 */

/** 查询 LiveTalking 渲染服务是否可用 */
export async function getAvatarStatus() {
  try {
    const d = await client.get('/avatar/status')
    return d || { available: false }
  } catch (_) {
    return { available: false }
  }
}

/**
 * 把一段台词交给数字人念出。
 * 后端会转发给 LiveTalking 的 /human；不可用时返回 delivered:false，
 * 前端据此仅显示字幕（不报错、不打断使用）。
 */
export async function avatarTalk(text) {
  try {
    const d = await client.post('/avatar/talk', { text })
    return d || { delivered: false }
  } catch (_) {
    return { delivered: false }
  }
}
