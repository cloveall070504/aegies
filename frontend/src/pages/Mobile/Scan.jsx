import { useState } from 'react'
import RiskCard from '../../components/RiskCard'
import { useScan } from '../../hooks/useScan'
import { useCurrentScene } from '../../hooks/useSceneType'

const DEMO = '加热试管时试管口朝向人。\n未佩戴护目镜操作腐蚀性试剂。'

export default function MobileScan() {
  const currentScene = useCurrentScene()
  const {
    scenes, sceneId, setSceneId, risks, loading, error, currentScanScene, runScan,
    stepText, setStepText, stepFindings, stepSummary, stepScanning, stepError, scanSteps, resolveCode,
  } = useScan()
  const [tab, setTab] = useState('analyze')
  const [code, setCode] = useState('')

  const onCode = () => {
    const r = resolveCode(code)
    if (r?.kind === 'scene') setTab('catalog')
    else if (r?.kind === 'text') setTab('analyze')
    setCode('')
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>🔍 实操风险扫描 · {currentScene?.icon} {currentScene?.name}</h2>

      {/* 扫码 / 编号 入口 */}
      <div className="card" style={{ padding: 10, marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 0, fontSize: 13 }}
          placeholder="器材编号 / 二维码内容"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCode()}
        />
        <button className="btn-outline chip-btn" onClick={onCode} disabled={!code.trim()}>识别</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={tab === 'analyze' ? 'btn chip-btn' : 'btn-outline chip-btn'} onClick={() => setTab('analyze')}>分析步骤</button>
        <button className={tab === 'catalog' ? 'btn chip-btn' : 'btn-outline chip-btn'} onClick={() => setTab('catalog')}>风险点库</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {tab === 'analyze' && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            placeholder={DEMO}
            value={stepText}
            onChange={(e) => setStepText(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="select" style={{ maxWidth: 160, fontSize: 13 }} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
              {scenes.map((s) => (<option key={s.scene_code} value={s.scene_code}>{s.icon} {s.name}</option>))}
            </select>
            <button className="btn chip-btn" onClick={() => scanSteps(stepText)} disabled={stepScanning || !stepText.trim()}>
              {stepScanning ? '扫描中…' : '开始扫描'}
            </button>
          </div>
          {stepError && <div className="alert alert-error" style={{ marginTop: 8, fontSize: 12 }}>{stepError}</div>}
        </div>
      )}

      {tab === 'analyze' && stepFindings && (
        <>
          {stepSummary && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              高危 {stepSummary.high ?? 0} · 中危 {stepSummary.medium ?? 0} · 低危 {stepSummary.low ?? 0} · 安全 {stepSummary.none ?? 0}
            </div>
          )}
          {stepFindings.length === 0 && <div className="card empty"><div className="empty-icon">✅</div><div className="empty-text">未检测到风险步骤</div></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stepFindings.map((f) => (
              <div className="card risk-card" key={f.index} data-level={f.level} style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="badge">第 {f.index} 步</span>
                  <span className="muted" style={{ fontSize: 12 }}>风险 {f.level}</span>
                </div>
                <p style={{ fontSize: 13, marginTop: 6, marginBottom: 4 }}>{f.step}</p>
                {f.consequence && <p style={{ fontSize: 12, color: 'var(--red)', margin: '4px 0' }}>⚠ {f.consequence}</p>}
                {f.correction && <p style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{f.correction}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'catalog' && (
        <>
          <select className="select" style={{ marginBottom: 12, width: '100%' }} value={sceneId} onChange={(e) => { setSceneId(e.target.value); runScan(e.target.value) }}>
            {scenes.map((s) => (<option key={s.scene_id} value={s.scene_id}>{s.icon} {s.name}</option>))}
          </select>
          {currentScanScene && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              {currentScanScene.icon} {currentScanScene.name} 风险点库
            </div>
          )}
          {loading && <div className="card"><div className="skeleton" style={{ height: 60 }} /></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {risks.map((r) => (<RiskCard key={r.id} item={r} />))}
          </div>
          {!loading && risks.length === 0 && !error && (
            <div className="card empty"><div className="empty-icon">🔍</div><div className="empty-text">该场景暂无风险点</div></div>
          )}
        </>
      )}
    </div>
  )
}
