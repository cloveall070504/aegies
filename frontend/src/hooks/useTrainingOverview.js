/**
 * 共享培训总览逻辑 hook（PC / Mobile 通用）
 * 负责：拉取培训总览，并按当前全局场景过滤出当前场景的培训卡片。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTrainingOverview } from '../api/scenes'
import { useCurrentScene } from './useSceneType'

export function useTrainingOverview() {
  const currentScene = useCurrentScene()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getTrainingOverview()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load, currentScene?.scene_code])

  // 只保留当前全局场景的培训卡片
  const currentSceneItem = useMemo(
    () => (data?.scenes || []).find((s) => s.scene_code === currentScene?.scene_code) || null,
    [data, currentScene?.scene_code]
  )

  return { data, loading, error, currentScene, currentSceneItem, reload: load }
}
