import { useEffect, useState } from 'react'
import { getScenes, scanScene } from '../../api/scenario'
import RiskCard from '../../components/RiskCard'

export default function MobileScan() {
  const [scenes, setScenes] = useState([])
  const [sceneId, setSceneId] = useState('')
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getScenes()
      .then((list) => {
        setScenes(list)
        if (list.length) {
          setSceneId(list[0].id)
          run(list[0].id)
        }
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (id) => {
    setLoading(true)
    setError('')
    try {
      const data = await scanScene(id, { page: 1, page_size: 20 })
      setRisks(data.risks || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>场景一键风险扫描</h2>
      <select className="select" style={{ marginBottom: 12 }} value={sceneId} onChange={(e) => { setSceneId(e.target.value); run(e.target.value) }}>
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
      {loading && <div className="muted">扫描中…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {risks.map((r) => (
          <RiskCard key={r.id} item={r} />
        ))}
      </div>
      {!loading && risks.length === 0 && !error && <div className="muted">该场景暂无风险点</div>}
    </div>
  )
}
