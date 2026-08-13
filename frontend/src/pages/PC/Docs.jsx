import { useEffect, useRef, useState } from 'react'
import { getDocRisks, listDocs, uploadDoc } from '../../api'
import RiskTag from '../../components/RiskTag'
import { formatTime } from '../../utils/format'

export default function Docs() {
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [riskDocId, setRiskDocId] = useState(null)
  const [risks, setRisks] = useState([])
  const fileRef = useRef(null)

  const load = () => {
    listDocs().then(setDocs).catch((e) => setError(e.message))
  }

  useEffect(() => {
    load()
  }, [])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const data = await uploadDoc(file)
      load()
      setRiskDocId(data.doc_id)
      setRisks(data.risks || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const showRisks = async (docId) => {
    try {
      const data = await getDocRisks(docId)
      setRiskDocId(docId)
      setRisks(data.risks || [])
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">文档上传与知识库构建</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={onUpload} />
          <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? '上传解析中…' : '上传规范文档'}
          </button>
          <span className="muted">支持 PDF / Word / TXT，AI 自动抽取风险点</span>
        </div>
        {error && <div style={{ color: 'var(--red)', marginTop: 8, fontSize: 13 }}>{error}</div>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', marginBottom: 16 }}>
        {docs.map((d) => (
          <div className="card" key={d.id} onClick={() => showRisks(d.id)} style={{ cursor: 'pointer' }}>
            <strong style={{ fontSize: 14 }}>{d.title}</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {d.scene_type} · {d.status} · {formatTime(d.created_at)}
            </div>
          </div>
        ))}
        {docs.length === 0 && <div className="muted">暂无文档，上传规范文档后自动抽取风险点</div>}
      </div>

      {riskDocId !== null && (
        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>风险抽取结果（文档 #{riskDocId}）</h3>
          {risks.length === 0 && <div className="muted">该文档尚未抽取到风险点</div>}
          {risks.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <RiskTag level={r.level} />
                <span className="muted" style={{ fontSize: 12 }}>条款：{r.clause_ref}</span>
              </div>
              <div style={{ fontSize: 14 }}>{r.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
