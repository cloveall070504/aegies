import client from './client'

export const getPersonalProfile = () => client.get('/profile/personal')
export const getDashboard = () => client.get('/dashboard/summary')
export const getOrgDashboard = (orgId) => client.get('/org/dashboard', { params: { org_id: orgId } })
