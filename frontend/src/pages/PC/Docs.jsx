import RiskTag from '../../components/RiskTag'
import { formatTime } from '../../utils/format'
import { useSceneName } from '../../hooks/useSceneType'
import { useDocs } from '../../hooks/useDocs'
import { useAuth } from '../../hooks/useAuth'

export default function Docs() {
  const sceneName = useSceneName()
  const { user } = useAuth()
  const { docs, uploading, error, riskDocId, risks, fileRef, onUpload, showRisks, onDelete } = useDocs()

  // 仅教师 / 管理员 / 安全员，或上传者本人可删除
  const canDelete = (d) => ['teacher', 'admin', 'safety'].includes(user?.role) || d.uploaded_by === user?.id

  return (
    <div>
      <h1 className="page-title">文档上传与知识库构建</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" onChange={onUpload} style={{ display: 'none' }} />
          <button className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <><span className="spinner" /> 上传解析中…</> : '📄 上传规范文档'}
          </button>
          <span className="muted">支持 PDF / Word / TXT，AI 自动抽取风险点 · 归属场景：<strong>{sceneName}</strong></span>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', marginBottom: 16 }}>
        {docs.map((d) => (
          <div className="card" key={d.id} onClick={() => showRisks(d.id)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="step-badge">📄</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: 14, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {d.scene_type} · {d.status} · {formatTime(d.created_at)}
                </div>
              </div>
              {canDelete(d) && (
                <button
                  className="btn-outline"
                  style={{ flexShrink: 0, padding: '4px 10px', fontSize: 12 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`确认删除文档「${d.title}」？该操作不可恢复，且会同时移除其抽取的风险点。`)) {
                      onDelete(d.id)
                    }
                  }}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
        {docs.length === 0 && (
          <div className="card empty"><div className="empty-icon">📄</div><div className="empty-text">暂无文档，上传规范文档后自动抽取风险点</div></div>
        )}
      </div>

      {riskDocId !== null && (
        <div className="card">
          <h3 className="section-title"><span className="dot" />风险抽取结果（#{riskDocId}）</h3>
          {risks.length === 0 ? (
            <div className="muted" style={{ marginTop: 6 }}>该文档尚未抽取到风险点</div>
          ) : (
            risks.slice(0, 10).map((r) => (
              <div key={r.id} className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <RiskTag level={r.level} />
                  <span className="muted" style={{ fontSize: 12 }}>条款：{r.clause_ref}</span>
                </div>
                <div style={{ fontSize: 13 }}>{r.description}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
