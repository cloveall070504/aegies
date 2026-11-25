/**
 * 共享场景推演逻辑 hook（PC / Mobile 通用）
 * 负责：提交操作行为 → 获取风险推演结果（含双智能体校验、条款溯源）。
 */
import { useCallback, useState } from 'react'
import { inferScenario, animateScenario } from '../api/scenario'
import { useCurrentScene } from './useSceneType'

export function useInfer() {
  const currentScene = useCurrentScene()
  const sceneType = currentScene?.category || 'experiment'
  const sceneCode = currentScene?.scene_code || 'chem_lab'
  const [behavior, setBehavior] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [animation, setAnimation] = useState(null)

  const submit = useCallback(
    async () => {
      if (!behavior.trim()) {
        setError('请输入操作行为描述')
        return
      }
      setLoading(true)
      setError('')
      setAnimation(null)
      try {
        const data = await inferScenario(behavior.trim(), sceneType, sceneCode)
        setResult(data)
        // 并行触发未来后果动画（复用同一行为，规则引擎唯一事实源）
        try {
          const anim = await animateScenario(behavior.trim(), sceneType, sceneCode)
          setAnimation(anim)
        } catch {
          // 动画失败不阻塞主推演结果展示
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [behavior, sceneType, sceneCode],
  )

  const reset = useCallback(() => {
    setResult(null)
    setAnimation(null)
    setBehavior('')
    setError('')
  }, [])

  return {
    currentScene, sceneType, sceneCode, behavior, setBehavior,
    loading, error, result, animation, submit, reset,
  }
}
