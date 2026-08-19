/**
 * 共享驾驶舱数据 hook（PC Dashboard / Mobile Home 通用）
 * 负责：按当前全局场景拉取风险驾驶舱摘要。
 */
import { useCallback, useEffect, useState } from 'react'
import { getDashboard } from '../api/profile'
import { useSceneCode } from './useSceneType'

export function useDashboard() {
  const sceneCode = useSceneCode()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setData(null)
    getDashboard('experiment', sceneCode)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [sceneCode])

  useEffect(() => {
    load()
  }, [load])

  return { data, error, reload: load }
}
