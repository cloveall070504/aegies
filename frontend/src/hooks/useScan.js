/**
 * 共享「实操风险扫描器」逻辑 hook（PC / Mobile 通用，消除双端行为漂移）。
 *
 * 定位（D1 明确）：
 *   1) 文本风险扫描 —— 粘贴/输入实验操作步骤（每行一步），逐行比对规则引擎 + RAG 风险库，
 *      返回每步风险等级 / 违反条款 / 后果 / 纠正建议（scanSteps）。
 *   2) 风险库浏览 —— 按场景查看权威风险点清单（runScan / scanScene）。
 *   3) 扫码/编号入口 —— 输入器材编号或二维码解码文本：命中场景则跳该场景库，否则当步骤文本扫描。
 *
 * 场景数据源统一走 /scenes（与 useSimTrain / useSceneType 一致），不再使用陈旧的 /scene/list
 * （后者只返回 chem_lab 单场景、且字段 schema 不一致），否则新场景在扫描页不可见。
 * 状态与请求竞态防护集中在此，PC/Scan 与 Mobile/Scan 仅负责 UI 渲染。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { listScenes } from '../api/scenes'
import { scanScene } from '../api/scenario'
import { scanText } from '../api'
import { useCurrentScene } from './useSceneType'
import { isAllowedScene } from '../utils/sceneFilter'

export function useScan() {
  const currentScene = useCurrentScene()
  const [scenes, setScenes] = useState([])
  const [sceneId, setSceneId] = useState('') // 此处 sceneId 实为 scene_code（scan 端点按 code 索引）
  const [risks, setRisks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 文本风险扫描（逐行分析步骤）
  const [stepText, setStepText] = useState('')
  const [stepFindings, setStepFindings] = useState(null)
  const [stepSummary, setStepSummary] = useState(null)
  const [stepScanning, setStepScanning] = useState(false)
  const [stepError, setStepError] = useState('')

  const reqIdRef = useRef(0)

  const runScan = useCallback(
    async (code, page = 1) => {
      if (!code) return
      const myId = ++reqIdRef.current
      setLoading(true)
      setError('')
      setRisks([])
      try {
        const data = await scanScene(code, { page, page_size: 50 })
        if (myId !== reqIdRef.current) return
        setRisks(data.risks || [])
        setTotal(data.total || 0)
      } catch (err) {
        if (myId !== reqIdRef.current) return
        setError(err.message)
      } finally {
        if (myId === reqIdRef.current) setLoading(false)
      }
    },
    [],
  )

  // 文本步骤风险扫描：每行一步，逐行比对规则引擎 + RAG 风险库
  const scanSteps = useCallback(
    async (text) => {
      const t = (text ?? '').trim()
      if (!t) return
      const myId = ++reqIdRef.current
      setStepScanning(true)
      setStepError('')
      setStepFindings(null)
      setStepSummary(null)
      try {
        const d = await scanText(t, sceneId)
        if (myId !== reqIdRef.current) return
        setStepFindings(d.findings || [])
        setStepSummary(d.summary || {})
      } catch (e) {
        if (myId !== reqIdRef.current) return
        setStepError(e.message)
      } finally {
        if (myId === reqIdRef.current) setStepScanning(false)
      }
    },
    [sceneId],
  )

  // 扫码/编号入口：命中 scene 则跳该场景风险库；否则按步骤文本扫描
  const resolveCode = useCallback(
    (raw) => {
      const v = (raw ?? '').trim()
      if (!v) return
      const hit = scenes.find(
        (s) =>
          (s.scene_code && s.scene_code.toLowerCase() === v.toLowerCase()) ||
          (String(s.id) === v),
      )
      if (hit) {
        setSceneId(hit.scene_code)
        runScan(hit.scene_code)
        return { kind: 'scene', scene: hit }
      }
      setStepText(v)
      scanSteps(v)
      return { kind: 'text' }
    },
    [scenes, runScan, scanSteps],
  )

  useEffect(() => {
    const myId = ++reqIdRef.current
    listScenes()
      .then((list) => {
        if (myId !== reqIdRef.current) return
        const allowed = (list || []).filter(isAllowedScene)
        setScenes(allowed)
        if (allowed.length > 0) {
          setSceneId(allowed[0].scene_code)
          runScan(allowed[0].scene_code)
        }
      })
      .catch((e) => {
        if (myId !== reqIdRef.current) return
        setError(e.message)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentScanScene = scenes.find((s) => s.scene_code === sceneId)

  return {
    scenes, sceneId, setSceneId, risks, total, loading, error,
    currentScanScene, runScan,
    stepText, setStepText, stepFindings, stepSummary, stepScanning, stepError, scanSteps, resolveCode,
  }
}
