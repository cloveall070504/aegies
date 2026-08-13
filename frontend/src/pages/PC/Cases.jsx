import { useEffect, useState } from 'react'
import { listCases, reviewCase } from '../../api'
import RiskTag from '../../components/RiskTag'

export default function Cases() {
  const [cases, setCases] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState('')

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

  const onSearch = () => {
    setPage(1)
    load(1, keyword)
  }

  const onReview = async (id, action) => {
    try {
      await reviewCase(id, action)
      load(page, keyword)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">错误案例库</h1>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="搜索行为关键词"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
        />
        <button className="btn" onClick={onSearch}>搜索</button>
        <span className="muted" style={{ alignSelf: 'center' }}>共 {total} 条</span>
      </div>
      {error && <div className="card" style={{ color: 'var(--red)' }}>{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {cases.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <RiskTag level={c.risk_level} />
              <span className="muted">频率 {c.frequency} · {c.status}</span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.5 }}>{c.behavior}</p>
            <div className="muted" style={{ fontSize: 12 }}>来源：{c.source || '-'}</div>
            {c.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => onReview(c.id, 'approve')}>通过</button>
                <button className="btn-outline" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => onReview(c.id, 'reject')}>驳回</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {total > 10 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn-outline" disabled={page <= 1} onClick={() => { setPage(page - 1); load(page - 1) }}>上一页</button>
          <span className="muted" style={{ alignSelf: 'center' }}>第 {page} 页</span>
          <button className="btn-outline" disabled={page * 10 >= total} onClick={() => { setPage(page + 1); load(page + 1) }}>下一页</button>
        </div>
      )}
    </div>
  )
}
