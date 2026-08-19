/**
 * 共享个人画像逻辑 hook（PC / Mobile 通用）
 * 负责：按当前全局场景拉取个人避错成长画像。
 */
import { useCallback, useEffect, useState } from 'react'
import { getPersonalProfile } from '../api/profile'
import { useSceneCode } from './useSceneType'

export function useProfile() {
  const sceneCode = useSceneCode()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')

  const load = useCallback(() => {
    setLoadError('')
    getPersonalProfile('experiment', sceneCode)
      .then(setData)
      .catch((e) => setLoadError(e.message))
  }, [sceneCode])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  return { data, loadError, actionError, setActionError, reload: load }
}
