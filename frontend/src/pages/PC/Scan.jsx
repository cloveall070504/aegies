import { useEffect, useState } from 'react'
import { getScenes, scanScene } from '../../api/scenario'
import RiskCard from '../../components/RiskCard'

export default function Scan() {
  const [scenes, setScenes] = useState([])
  const [sceneId, setSceneId] = useState('')
  const [risks, setRisks] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getScenes()
      .then((list) => {
        setScenes(list)
        if (list.length > 0) {
          setSceneId(list[0].id)
          runScan(list[0].id)
        }
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runScan = async (id, page = 1) => {
    setLoading(true)
    setError('')
    try {
      const data = await scanScene(id, { page, page_size: 50 })
      setRisks(data.risks || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">场景一键风险扫描</h1>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="muted">选择场景：</label>
        <select className="select" style={{ maxWidth: 320 }} value={sceneId} onChange={(e) => { setSceneId(e.target.value); runScan(e.target.value) }}>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="btn" onClick={() => runScan(sceneId)} disabled={loading || !sceneId}>
          {loading ? '扫描中…' : '扫描'}
        </button>
        <span className="muted">共 {total} 个隐藏风险点</span>
      </div>
      {error && <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {risks.map((r) => (
          <RiskCard key={r.id} item={r} />
        ))}
      </div>
      {!loading && risks.length === 0 && !error && <div className="muted">该场景暂无风险点</div>}
    </div>
  )
}
