import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCases, reviewCase, explainCase } from '../../api'
import RiskTag from '../../components/RiskTag'
import PageHead from '../../components/PageHead'
import EmptyState from '../../components/EmptyState'
import useAuthStore from '../../store/authStore'

export default function Cases() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role) || 'student'
  const canReview = role === 'teacher' || role === 'admin'
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState('')
  const [explainId, setExplainId] = useState(null)
  const [explainText, setExplainText] = useState('')
  const [explainLoading, setExplainLoading] = useState(false)

  const load = async (p = 1, kw = keyword) => {
    setError('')
    try {
      const data = await listCases({ page: p, page_size: 10, keyword: kw })
      setCases(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSearch = () => { setPage(1); load(1, keyword) }

  const onReview = async (id, action) => {
    try { await reviewCase(id, action); load(page, keyword) }
    catch (err) { setError(err.message) }
  }

  const onExplain = async (id) => {
    setExplainId(id); setExplainText(''); setExplainLoading(true)
    try {
      const d = await explainCase(id)
      setExplainText(d.explanation || '暂无讲解')
    } catch (e) { setExplainText('讲解加载失败：' + e.message) }
    finally { setExplainLoading(false) }
  }

  const goInfer = (behavior) => navigate(`/sandbox?behavior=${encodeURIComponent(behavior)}`)

  return (
    <div>
      <PageHead
        eyebrow="学习资源"
        title="错误案例库"
        desc="真实踩坑案例沉淀，可一键推演或查看 AI 讲解"
        actions={
          <div className="search-bar">
            <input
              className="input"
              placeholder="搜索行为关键词"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            />
            <button className="btn" onClick={onSearch}>🔍 搜索</button>
            <span className="badge">共 {total} 条</span>
          </div>
        }
      />
      {error && <div className="alert alert-error">{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {cases.map((c) => (
          <div className="card risk-card" key={c.id} data-level={c.risk_level}>
            <div className="risk-card-head">
              <RiskTag level={c.risk_level} />
              <span className="muted">频率 {c.frequency} · {c.status}</span>
            </div>
            <p className="risk-card-desc">{c.behavior}</p>
            {c.analysis && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>分析：{c.analysis}</div>}
            <div className="muted" style={{ fontSize: 12 }}>来源：{c.source || '-'}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn chip-btn" onClick={() => goInfer(c.behavior)}>基于本案例推演</button>
              <button className="btn-outline chip-btn" onClick={() => onExplain(c.id)}>AI 讲解</button>
              {canReview && c.status === 'pending' && (
                <>
                  <button className="btn chip-btn" onClick={() => onReview(c.id, 'approve')}>通过</button>
                  <button className="btn-outline chip-btn" onClick={() => onReview(c.id, 'reject')}>驳回</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {cases.length === 0 && !error && (
        <EmptyState icon="📚" title="暂无案例" hint="还没有收录错误案例，去沙盘里推演几步或提交案例试试。" />
      )}
      {total > 10 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button className="btn-outline chip-btn" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1) }}>上一页</button>
          <span className="muted">第 {page} 页</span>
          <button className="btn-outline chip-btn" disabled={page * 10 >= total} onClick={() => { setPage(page + 1); load(page + 1) }}>下一页</button>
        </div>
      )}

      {explainId != null && (
        <div
          onClick={() => setExplainId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 className="section-title" style={{ margin: 0 }}><span className="dot" />AI 案例讲解</h3>
              <button className="btn-outline chip-btn" onClick={() => setExplainId(null)}>关闭</button>
            </div>
            {explainLoading ? <div className="muted"><span className="spinner" /> 生成讲解中…</div> : (
              <p style={{ lineHeight: 1.9, whiteSpace: 'pre-wrap', margin: 0 }}>{explainText}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
