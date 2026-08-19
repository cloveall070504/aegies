import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RiskCard from '../../components/RiskCard'
import { useScan } from '../../hooks/useScan'

const DEMO = '实验前未佩戴护目镜，直接打开浓硫酸试剂瓶。\n将水倒入浓硫酸中稀释。\n实验结束后未关闭酒精灯就离开实验室。'

export default function Scan() {
  const {
    scenes, sceneId, setSceneId, risks, total, loading, error, currentScanScene, runScan,
    stepText, setStepText, stepFindings, stepSummary, stepScanning, stepError, scanSteps, resolveCode,
  } = useScan()
  const navigate = useNavigate()
  const [tab, setTab] = useState('analyze')
  const [code, setCode] = useState('')

  const onScan = () => scanSteps(stepText)
  const onCode = () => {
    const r = resolveCode(code)
    if (r?.kind === 'scene') setTab('catalog')
    else if (r?.kind === 'text') setTab('analyze')
    setCode('')
  }

  const goInfer = (step) => navigate(`/scenario?behavior=${encodeURIComponent(step)}`)
  const goCases = () => navigate('/cases')

  return (
    <div>
      <h1 className="page-title">实操风险扫描</h1>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        定位：粘贴实验操作步骤（每行一步）逐行比对风险库，或切换场景浏览权威风险点；也可粘贴器材编号 / 二维码内容快速跳转。
      </div>

      {/* 扫码 / 编号 入口 */}
      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="粘贴器材编号 / 二维码解码文本（命中场景则跳转，否则按步骤扫描）"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCode()}
        />
        <button className="btn-outline" onClick={onCode} disabled={!code.trim()}>🔍 扫码 / 识别</button>
        <span className="muted" style={{ fontSize: 12 }}>支持 chem_titration / chem_distillation 等场景码</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={tab === 'analyze' ? 'btn' : 'btn-outline'} onClick={() => setTab('analyze')}>🔍 分析我的步骤</button>
        <button className={tab === 'catalog' ? 'btn' : 'btn-outline'} onClick={() => setTab('catalog')}>📚 浏览风险点库</button>
      </div>

      {tab === 'analyze' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="muted" style={{ fontSize: 13 }}>粘贴你的实验步骤 / 操作方案，逐行分析风险（每行一步）：</label>
          <textarea
            className="input"
            style={{ width: '100%', minHeight: 120, marginTop: 8, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder={DEMO}
            value={stepText}
            onChange={(e) => setStepText(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="muted">场景：</label>
            <select className="select" style={{ maxWidth: 240 }} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
              {scenes.map((s) => (<option key={s.scene_code} value={s.scene_code}>{s.icon} {s.name}</option>))}
            </select>
            <button className="btn" onClick={onScan} disabled={stepScanning || !stepText.trim()}>
              {stepScanning ? <><span className="spinner" /> 扫描中…</> : '🔍 开始扫描'}
            </button>
            <button className="btn-outline" onClick={() => setStepText(DEMO)}>填入示例</button>
          </div>
          {stepError && <div className="alert alert-error" style={{ marginTop: 10 }}>{stepError}</div>}
        </div>
      )}

      {tab === 'analyze' && stepFindings && (
        <>
          {stepSummary && (
            <div className="stat-row" style={{ marginBottom: 16 }}>
              <div className="card stat-card" data-level="high"><div className="muted">高危步骤</div><div className="stat-num">{stepSummary.high ?? 0}</div></div>
              <div className="card stat-card" data-level="medium"><div className="muted">中危步骤</div><div className="stat-num">{stepSummary.medium ?? 0}</div></div>
              <div className="card stat-card" data-level="low"><div className="muted">低危步骤</div><div className="stat-num">{stepSummary.low ?? 0}</div></div>
              <div className="card stat-card"><div className="muted">安全/未识别</div><div className="stat-num">{stepSummary.none ?? 0}</div></div>
            </div>
          )}
          {stepFindings.length === 0 && <div className="card empty"><div className="empty-icon">✅</div><div className="empty-text">未检测到风险步骤</div></div>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {stepFindings.map((f) => (
              <div className="card risk-card" key={f.index} data-level={f.level}>
                <div className="risk-card-head">
                  <span className="badge">第 {f.index} 步</span>
                  <span className="muted">风险等级 {f.level}</span>
                </div>
                <p className="risk-card-desc">{f.step}</p>
                {f.matched_clauses?.length > 0 && (
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>违反条款：{f.matched_clauses[0]}</div>
                )}
                <p style={{ fontSize: 13, lineHeight: 1.7, margin: '6px 0' }}>{f.consequence}</p>
                <div className="muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{f.correction}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn chip-btn" onClick={() => goInfer(f.step)}>去推演这步</button>
                  {f.related_case_ids?.length > 0 && (
                    <button className="btn-outline chip-btn" onClick={goCases}>查看相关案例</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'catalog' && (
        <>
          <div className="toolbar">
            <label className="muted">选择场景：</label>
            <select className="select" style={{ maxWidth: 320 }} value={sceneId} onChange={(e) => { setSceneId(e.target.value); runScan(e.target.value) }}>
              {scenes.map((s) => (<option key={s.scene_code} value={s.scene_code}>{s.icon} {s.name}</option>))}
            </select>
            <span className="badge">{currentScanScene?.icon} {currentScanScene?.name} · 共 {total} 个风险点</span>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {currentScanScene && (
            <div className="hero" style={{ marginBottom: 16 }}>
              <div className="hero-title">{currentScanScene.icon} {currentScanScene.name}</div>
              <div className="hero-sub">共 {total} 个风险知识点 · 覆盖高危/中危/低危三级分类 · 每条均含规范条款溯源</div>
            </div>
          )}
          {risks.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
              {risks.map((r) => (<RiskCard key={r.id} item={r} />))}
            </div>
          )}
          {!loading && risks.length === 0 && !error && (
            <div className="card empty"><div className="empty-icon">🔍</div><div className="empty-text">该场景暂无风险点</div></div>
          )}
        </>
      )}
    </div>
  )
}
