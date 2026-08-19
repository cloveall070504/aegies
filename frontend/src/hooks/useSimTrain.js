/**
 * 共享分步骤模拟培训逻辑 hook（PC / Mobile 通用）
 * 负责：加载场景步骤、选择/揭示、上一步/下一步、提交评分、结果状态。
 * 进入页面会同步全局场景（setCurrentScene）。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSceneSteps, submitSim, listScenes } from '../api/scenes'
import useSceneStore from '../store/sceneStore'
import useThemeStore from '../store/themeStore'
import { isAllowedScene } from '../utils/sceneFilter'

export function useSimTrain() {
  const { sceneCode, stage = 'sim' } = useParams()
  const navigate = useNavigate()
  const setScenes = useSceneStore((s) => s.setScenes)
  const setCurrentScene = useSceneStore((s) => s.setCurrentScene)
  const [steps, setSteps] = useState([])
  const [scene, setScene] = useState(null)
  const [idx, setIdx] = useState(0)
  const [choices, setChoices] = useState([])
  const [selected, setSelected] = useState(-1)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      setError('')
      try {
        const [s, stepsRsp] = await Promise.all([
          listScenes().then((arr) => {
            const allowed = (arr || []).filter(isAllowedScene)
            setScenes(allowed)
            return allowed.find((x) => x.scene_code === sceneCode)
          }),
          getSceneSteps(sceneCode),
        ])
        setScene(s || { scene_code: sceneCode, name: sceneCode, icon: '📋' })
        if (s) { setCurrentScene(s); useThemeStore.setState({ theme: s.theme_name }) }
        setSteps(stepsRsp?.steps || [])
        setChoices(new Array((stepsRsp?.steps || []).length).fill(-1))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneCode, stage])

  const currentStep = steps[idx]

  const onChoose = useCallback((i) => {
    if (revealed) return
    setSelected(i)
    setRevealed(true)
    setChoices((prev) => {
      const next = [...prev]
      next[idx] = i
      return next
    })
  }, [revealed, idx])

  const goTo = useCallback((nextIdx) => {
    setIdx(nextIdx)
    setSelected(choices[nextIdx] ?? -1)
    setRevealed(choices[nextIdx] !== undefined && choices[nextIdx] >= 0)
  }, [choices])

  const nextStep = useCallback(() => {
    if (idx < steps.length - 1) {
      goTo(idx + 1)
    } else {
      doSubmit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, steps.length, choices, goTo, revealed, setSelected, setRevealed, setChoices, selected])

  const prevStep = useCallback(() => {
    if (idx > 0) goTo(idx - 1)
  }, [idx, goTo])

  const doSubmit = useCallback(async () => {
    if (choices.some((c) => c < 0)) {
      setError('请完成所有步骤')
      return
    }
    setSubmitLoading(true)
    setError('')
    try {
      const r = await submitSim({ scene_code: sceneCode, stage, choices })
      setResult(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitLoading(false)
    }
  }, [choices, sceneCode, stage])

  const retry = useCallback(() => {
    setResult(null)
    setIdx(0)
    setChoices(new Array(steps.length).fill(-1))
    setSelected(-1)
    setRevealed(false)
  }, [steps.length])

  return {
    sceneCode, stage, scene, steps, idx, choices, selected, revealed, loading, submitLoading, result, error,
    currentStep, onChoose, nextStep, prevStep, retry, setError, navigate,
  }
}
