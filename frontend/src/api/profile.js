import client from './client'

// sceneCode 优先，sceneType 兜底
export const getPersonalProfile = (sceneType, sceneCode) =>
  client.get('/profile/personal', { params: { scene_type: sceneType || '', scene_code: sceneCode || '' } })

export const getDashboard = (sceneType, sceneCode) =>
  client.get('/dashboard/summary', { params: { scene_type: sceneType || '', scene_code: sceneCode || '' } })

export const getOrgDashboard = (orgId) => client.get('/org/dashboard', { params: { org_id: orgId || 'default_org' } })

export const getCertificate = () => client.get('/profile/certificate')
