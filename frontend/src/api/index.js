import client from './client'

export const listCases = (params) => client.get('/cases', { params })
export const getCaseDetail = (id) => client.get(`/cases/${id}`)
export const reviewCase = (id, action) => client.post(`/cases/${id}/review`, { action })

export const listDocs = () => client.get('/docs')
export const uploadDoc = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/docs/upload', form, { timeout: 120000 })
}
export const getDocRisks = (docId) => client.get(`/docs/${docId}/risks`)

export const getQuestions = () => client.get('/quiz/questions')
export const submitQuiz = (answers) => client.post('/quiz/submit', { quiz_id: 'quiz_001', answers })
export const getQuizRecords = () => client.get('/quiz/records')

export const generateReport = (type, targetId) => client.post('/report/generate', { type, target_id: targetId || '' })
export const listReports = () => client.get('/report')

export const getOrgDashboard = (orgId) => client.get('/org/dashboard', { params: { org_id: orgId || 'default_org' } })
