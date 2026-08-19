import client from './client'

// 场景列表
export const listScenes = () => client.get('/scenes')
export const createScene = (payload) => client.post('/scenes', payload)
export const updateScene = (sceneCode, payload) => client.put(`/scenes/${sceneCode}`, payload)
export const deleteScene = (sceneCode) => client.delete(`/scenes/${sceneCode}`)

// 分步骤模拟
export const getSceneSteps = (sceneCode) => client.get(`/scenes/${sceneCode}/steps`)
export const addSceneStep = (payload) => client.post(`/scenes/${payload.scene_code}/steps`, payload)
export const updateSceneStep = (sceneCode, stepId, payload) => client.put(`/scenes/${sceneCode}/steps/${stepId}`, payload)
export const deleteSceneStep = (sceneCode, stepId) => client.delete(`/scenes/${sceneCode}/steps/${stepId}`)

/**
 * 提交分步骤模拟
 * payload: { scene_code, stage: 'pre'|'sim'|'post', choices: number[] }
 */
export const submitSim = (payload) => client.post('/scenes/sim/submit', payload)

// 培训总览 & 报告
export const getTrainingOverview = () => client.get('/scenes/training/overview')
export const getTrainingReport = (sceneCode) => client.get(`/scenes/training/${sceneCode}/report`)
