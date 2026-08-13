import client from './client'

export const inferScenario = (behavior, sceneType) =>
  client.post('/scenario/infer', { behavior, scene_type: sceneType })

export const getRecords = (params) => client.get('/scenario/records', { params })
export const getScenes = () => client.get('/scene/list')
export const scanScene = (sceneId, params) => client.get(`/scene/${sceneId}/scan`, { params })
