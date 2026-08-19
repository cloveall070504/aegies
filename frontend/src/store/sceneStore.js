/** 场景状态存储：基于场景 code 的选择器，面向实验实训场景
 *  （学生、实验教师、实训中心管理员）。
 *  每个场景自带 theme_name（student 蓝白），
 *  旧 API 的 scene_type 参数从场景 category 映射：
 *    category=experiment → scene_type=experiment
 *    其他                → scene_type=experiment（默认实验）
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isAllowedScene } from '../utils/sceneFilter'

const DEFAULT_SCENE = {
  id: 1,
  scene_code: 'chem_lab',
  name: '化学实验标准流程',
  icon: '🧪',
  category: 'experiment',
  theme_name: 'student',
  builtin: true,
  description: '',
}

const CACHE_TTL_MS = 5 * 60 * 1000

let _scenesFetchPromise = null

const useSceneStore = create(
  persist(
    (set) => ({
      currentScene: DEFAULT_SCENE,
      scenes: [DEFAULT_SCENE],
      scenesLoadedAt: 0,
      setScenes: (scenes) => set({
        scenes: (scenes || []).filter(isAllowedScene),
        scenesLoadedAt: Date.now(),
      }),
      setCurrentScene: (scene) => set({ currentScene: scene }),
      refreshScenesIfStale: (fetcher) => {
        const state = useSceneStore.getState()
        if (Date.now() - state.scenesLoadedAt < CACHE_TTL_MS && state.scenes.length > 1) {
          return Promise.resolve(state.scenes)
        }
        if (_scenesFetchPromise) return _scenesFetchPromise
        _scenesFetchPromise = fetcher().then((data) => {
          const allowed = (data || []).filter(isAllowedScene)
          set({ scenes: allowed, scenesLoadedAt: Date.now() })
          return allowed
        }).finally(() => {
          _scenesFetchPromise = null
        })
        return _scenesFetchPromise
      },
    }),
    {
      name: 'ai-avoid-scene',
      version: 1,
      migrate: (persistedState) => {
        if (!persistedState) return undefined
        const scenes = (persistedState.scenes || []).filter(isAllowedScene)
        const currentScene = isAllowedScene(persistedState.currentScene)
          ? persistedState.currentScene
          : DEFAULT_SCENE
        return {
          ...persistedState,
          scenes: scenes.length ? scenes : [DEFAULT_SCENE],
          currentScene,
        }
      },
    },
  ),
)

export default useSceneStore
