import { useEffect, useState } from 'react'
import { getEngineStatus } from '../api'

// 模块级缓存：所有组件共享一次探测结果，避免侧边栏/沙盘/页头重复打接口
let _promise = null
let _status = null
const _listeners = new Set()

function _notify(status) {
  _status = status
  _listeners.forEach((cb) => cb(status))
}

function fetchStatus() {
  if (_promise) return _promise
  _promise = getEngineStatus()
    .then((d) => d || { mode: 'rule', reason: '状态获取失败' })
    .catch(() => ({ mode: 'rule', reason: '无法连接后端，默认按规则模式展示' }))
    .then((s) => {
      _notify(s)
      return s
    })
  return _promise
}

/** 重置缓存并重新探测，所有订阅组件都会收到新状态 */
export function refreshEngineStatus() {
  _promise = null
  return fetchStatus()
}

/**
 * 引擎模式状态。返回 { status, loading }。
 * status: { mode: 'ai'|'rule', configured, reachable, model, model_present, reason }
 */
export function useEngineStatus() {
  const [status, setStatus] = useState(_status)
  const [loading, setLoading] = useState(_status === null)

  useEffect(() => {
    let alive = true
    _listeners.add((s) => { if (alive) setStatus(s) })
    fetchStatus()
      .then((s) => { if (alive) setStatus(s) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { status, loading }
}
