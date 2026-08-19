import client from './client'

export const listCases = (params) => client.get('/cases', { params })
export const getCaseDetail = (id) => client.get(`/cases/${id}`)
export const reviewCase = (id, action) => client.post(`/cases/${id}/review`, { action })
export const createCase = (data) => client.post('/cases', data)
export const updateCase = (id, data) => client.put(`/cases/${id}`, data)
export const deleteCase = (id) => client.delete(`/cases/${id}`)

export const listDocs = () => client.get('/docs')
export const uploadDoc = (file, sceneType) => {
  const form = new FormData()
  form.append('file', file)
  if (sceneType) form.append('scene_type', sceneType)
  return client.post('/docs/upload', form, { timeout: 120000 })
}
export const getDocRisks = (docId) => client.get(`/docs/${docId}/risks`)
export const deleteDoc = (docId) => client.delete(`/docs/${docId}`)

// 自测考试：scene_code 优先，scene_type 兜底
export const getQuestions = (sceneType, sceneCode) =>
  client.get('/quiz/questions', { params: { scene_type: sceneType || 'experiment', scene_code: sceneCode || '' } })
export const submitQuiz = (answers, sceneType, sceneCode, mode = 'practice') =>
  client.post('/quiz/submit', { quiz_id: 'quiz_001', answers, scene_type: sceneType || 'experiment', scene_code: sceneCode || '', mode })
export const getQuizRecords = (sceneCode) => client.get('/quiz/records', { params: sceneCode ? { scene_code: sceneCode } : {} })
export const getWrongBook = (sceneCode) => client.get('/quiz/wrong-book', { params: sceneCode ? { scene_code: sceneCode } : {} })
export const importQuiz = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/quiz/import', form, { timeout: 60000 })
}
export const listImportedQuiz = () => client.get('/quiz/imported')
export const deleteImportedQuiz = (id) => client.delete(`/quiz/imported/${id}`)

// 创作台：单题可视化 CRUD
export const listManagedQuiz = (sceneType, sceneCode) =>
  client.get('/quiz/questions/managed', { params: { scene_type: sceneType || '', scene_code: sceneCode || '' } })
export const createQuizQuestion = (data) => client.post('/quiz/questions', data)
export const updateQuizQuestion = (id, data) => client.put(`/quiz/questions/${id}`, data)
export const deleteQuizQuestion = (id) => client.delete(`/quiz/questions/${id}`)

// 报告
export const generateReport = (type, targetId) => client.post('/report/generate', { type, target_id: targetId || '' })
export const listReports = () => client.get('/report')
export const downloadReport = async (reportId) => {
  // 注意：client 响应拦截器对 blob 响应直接返回 Blob 本体
  return client.get(`/report/${reportId}/download`, { responseType: 'blob' })
}
export const getOnlineReport = (reportType, sceneCode) =>
  client.get(`/report/online/${reportType}`, { params: sceneCode ? { scene_code: sceneCode } : {} })

export const getOrgDashboard = (orgId) => client.get('/org/dashboard', { params: { org_id: orgId || 'default_org' } })
export const getOrgMembers = (orgId) => client.get('/org/members', { params: { org_id: orgId || '' } })
export const getStudentsOverview = (orgId) => client.get('/org/students-overview', { params: { org_id: orgId || '' } })
export const listOperationRecords = (params) => client.get('/org/operation-records', { params: params || {} })

// 系统管理（仅 admin）
export const getSystemInfo = () => client.get('/admin/system-info')

// 引擎状态（所有登录用户可见）：真实探测 Ollama 是否在线
export const getEngineStatus = () => client.get('/meta/engine-status')
// B1：Ollama 模型档位（仅管理员）
export const getOllamaModels = () => client.get('/admin/ollama-models')
export const switchOllamaModel = (model) => client.post('/admin/ollama-models/switch', { model })

// 作业管理
export const listAssignments = (status) => client.get('/assignments', { params: status ? { status } : {} })
export const createAssignment = (data) => client.post('/assignments', data)
export const getAssignmentProgress = (id) => client.get(`/assignments/${id}/progress`)
export const getAssignmentGradebook = (id) => client.get(`/assignments/${id}/gradebook`)
export const gradeAssignment = (assignmentId, userId, score, comment) =>
  client.put(`/assignments/${assignmentId}/grade`, { assignment_id: assignmentId, user_id: userId, score, comment })
export const closeAssignment = (id) => client.put(`/assignments/${id}/close`)
export const deleteAssignment = (id) => client.delete(`/assignments/${id}`)
export const updateAssignmentProgress = (data) => client.put('/assignments/progress', data)

// 证书
export const getCertificate = () => client.get('/profile/certificate')

// 风险扫描：真扫描（分析用户粘贴的实验步骤）
export const scanText = (text, sceneId) => client.post('/scene/scan-text', { text, scene_id: sceneId || '' })
// 避错沙盘：融合风险扫描 + 场景推演的逐步交互推演
export const simulateStep = (step, sceneId, history = []) =>
  client.post('/simulate/step', { step, scene_id: sceneId || '', history })
// 案例：基于本案例推演 / AI 讲解
export const practiceCase = (id) => client.post(`/cases/${id}/practice`)
export const explainCase = (id) => client.post(`/cases/${id}/explain`)

// 风险点管理（A1）：教师/管理员编辑、审核内置风险知识库
export const listRiskPoints = (params) => client.get('/risk-points', { params: params || {} })
export const createRiskPoint = (data) => client.post('/risk-points', data)
export const updateRiskPoint = (id, data) => client.put(`/risk-points/${id}`, data)
export const deleteRiskPoint = (id) => client.delete(`/risk-points/${id}`)
export const reviewRiskPoint = (id, action) => client.post(`/risk-points/${id}/review`, { action })

// 学生错误回流（A2）：对推演记录提交/审核反馈（教学闭环）
export const submitFeedback = (recordId, feedback, isMisjudge) =>
  client.post('/feedback/submit', { record_id: recordId, feedback: feedback || '', is_misjudge: !!isMisjudge })
export const listPendingFeedback = (params) => client.get('/feedback/pending', { params: params || {} })
export const resolveFeedback = (recordId, action) => client.post(`/feedback/${recordId}/resolve`, { action })

// 统一解包辅助：响应拦截器已把 {code,message,data} 解包为 body.data，
// 但不同接口 data 形态不一（数组 / {list,total} / {items}），历史代码出现过
// d / d.data 混写。统一复用 asList / asData，避免按字段名猜测、防止该问题复发。
export { asList, asData } from './client'
