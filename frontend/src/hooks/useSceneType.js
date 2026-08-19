import useSceneStore from '../store/sceneStore'

export function useSceneType() {
  const scene = useSceneStore((s) => s.currentScene)
  return scene?.category || 'experiment'
}

export function useCurrentScene() {
  return useSceneStore((s) => s.currentScene)
}

/** 获取当前场景代码（全局联动核心 hook） */
export function useSceneCode() {
  const scene = useSceneStore((s) => s.currentScene)
  return scene?.scene_code || 'chem_lab'
}

/** 获取当前场景名称 */
export function useSceneName() {
  const scene = useSceneStore((s) => s.currentScene)
  return scene?.name || '化学实验标准流程'
}

export default useSceneType
