import client from './client'
import { trackASR } from '../utils/telemetry'

/**
 * 语音识别：把前端录好的音频（MediaRecorder 产出的 Blob）上传到后端 /companion/asr，
 * 后端转调 DashScope Paraformer 转写，返回 { text, available }。
 *
 * 关键：不要手动设 Content-Type，让 axios 自动加 multipart/form-data 的 boundary，
 * 否则后端收不到正确的分段边界，解析会失败。
 */
export function companionAsr(blob, { timeout = 60000 } = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const form = new FormData()
  const ext = (blob.type || '').includes('wav')
    ? 'wav'
    : (blob.type || '').includes('mp4')
      ? 'm4a'
      : 'webm'
  form.append('file', blob, `recording.${ext}`)
  return client.post('/companion/asr', form, { timeout }).then(
    (res) => {
      // 转写成功以"是否拿到有效文本"判定
      const text = (res && (res.text || (res.data && res.data.text))) || ''
      trackASR(!!text, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
      return res
    },
    (err) => {
      trackASR(false, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
      throw err
    },
  )
}
