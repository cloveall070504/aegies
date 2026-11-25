import client from './client'

// sceneCode 优先，sceneType 兜底
export const inferScenario = (behavior, sceneType, sceneCode) =>
  client.post('/scenario/infer', { behavior, scene_type: sceneType || 'experiment', scene_code: sceneCode || '' })

// 未来后果动画：基于反向 RAG + AI 生成一段可动画演示的「未来后果」分镜
export const animateScenario = (behavior, sceneType, sceneCode) =>
  client.post('/scenario/animate', { behavior, scene_type: sceneType || 'experiment', scene_code: sceneCode || '' })

export const getRecords = (params) => client.get('/scenario/records', { params })

// category: experiment|空=全部，按主题过滤场景列表
export const getScenes = (category) =>
  client.get('/scene/list', { params: category ? { category } : {} })

export const scanScene = (sceneId, params) => client.get(`/scene/${sceneId}/scan`, { params })
