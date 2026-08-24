import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSystemInfo, getOllamaModels, switchOllamaModel, switchAiProvider } from '../../api'

const ROLE_LABEL = { admin: '管理员', teacher: '教师', student: '学生' }
const RISK_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }

export default function SystemSettings() {
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [models, setModels] = useState(null)
  const [switching, setSwitching] = useState('')
  const [switchingProvider, setSwitchingProvider] = useState('')
  const [switchMsg, setSwitchMsg] = useState('')

  useEffect(() => {
    getSystemInfo().then(setInfo).catch((e) => setError(e.message))
    getOllamaModels().then(setModels).catch(() => {})
  }, [])

  const handleSwitchProvider = async (provider) => {
    if (!info || provider === info.ai_provider) return
    setSwitchingProvider(provider)
    setSwitchMsg('')
    try {
      const d = await switchAiProvider(provider)
      setInfo((prev) => ({ ...prev, ai_provider: d.provider }))
      setSwitchMsg(
        d.provider === 'cloud'
          ? `已切换到千问云端（${d.model} @ ${d.base_url}），AI 增强模式生效。`
          : `已切回本地 Ollama（${d.model}）。`
      )
      // 刷新模型档位列表：cloud 下展示云端模型，ollama 下展示本地档位
      getOllamaModels().then(setModels).catch(() => {})
    } catch (e) {
      setSwitchMsg('切换失败：' + (e.message || '未知错误'))
    } finally {
      setSwitchingProvider('')
    }
  }

  const handleSwitch = async (model) => {
    setSwitching(model)
    setSwitchMsg('')
    try {
      const d = await switchOllamaModel(model)
      setModels((prev) => prev && {
        ...prev,
        active: d.active,
        candidates: prev.candidates.map((c) => ({ ...c, active: c.name === d.active })),
      })
      const st = d.engine_status || {}
      setSwitchMsg(
        st.mode === 'ai'
          ? `已切换为 ${d.active}，AI 增强模式生效。`
          : `已切换为 ${d.active}（当前引擎：${st.mode === 'rule' ? '规则模式' : '未知'}）。${st.reason || ''}`
      )
    } catch (e) {
      setSwitchMsg('切换失败：' + (e.message || '未知错误'))
    } finally {
      setSwitching('')
    }
  }

  if (error) return <div className="card" style={{ color: 'var(--red)' }}>加载失败：{error}</div>
  if (!info) return <div className="card"><div className="skeleton" style={{ height: 160 }} /></div>

  const keywords = info.risk_keywords || {}

  return (
    <div>
      <h1 className="page-title">系统设置</h1>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid #f59e0b55' }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#f59e0b', borderRadius: 999, padding: '4px 10px' }}>管理专属</span>
        <span className="muted" style={{ fontSize: 13 }}>系统运行状态、AI 引擎与风险判定规则总览</span>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 className="section-title"><span className="dot" />系统资源</h3>
          <div className="info-row"><span>用户总数</span><span className="muted">{info.total_users}</span></div>
          <div className="info-row"><span>场景数量</span><span className="muted">{info.total_scenes}</span></div>
          <div className="info-row"><span>题库题目</span><span className="muted">{info.total_questions}</span></div>
          <div className="info-row"><span>推演记录</span><span className="muted">{info.total_records}</span></div>
          <div className="info-row"><span>作业记录</span><span className="muted">{info.total_assignments}</span></div>
        </div>

        <div className="card">
          <h3 className="section-title"><span className="dot" />AI 引擎</h3>
          <div className="info-row">
            <span>本地模型（Ollama）</span>
            <span style={{ color: info.enable_ollama ? 'var(--green)' : 'var(--muted)', fontWeight: 600 }}>
              {info.enable_ollama ? '● 已启用' : '○ 已关闭（规则引擎兜底）'}
            </span>
          </div>
          <div className="info-row"><span>模型名称</span><span className="muted">{info.ollama_model || '-'}</span></div>
          <div className="info-row"><span>服务地址</span><span className="muted">{info.ollama_base_url || '-'}</span></div>
          <div className="info-row"><span>运行环境</span><span className="muted">{info.app_env || 'dev'}</span></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>引擎模式（运行时切换，无需重启后端）</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                disabled={switchingProvider === 'ollama'}
                onClick={() => handleSwitchProvider('ollama')}
                style={{
                  flex: 1,
                  borderColor: info.ai_provider === 'ollama' ? 'var(--green)' : 'var(--border, #e5e7eb)',
                  background: info.ai_provider === 'ollama' ? 'rgba(16,185,129,0.12)' : 'transparent',
                  color: info.ai_provider === 'ollama' ? 'var(--green)' : 'inherit',
                  fontWeight: 600,
                }}
              >
                🖥️ 本地 Ollama
              </button>
              <button
                className="btn"
                disabled={switchingProvider === 'cloud'}
                onClick={() => handleSwitchProvider('cloud')}
                style={{
                  flex: 1,
                  borderColor: info.ai_provider === 'cloud' ? 'var(--green)' : 'var(--border, #e5e7eb)',
                  background: info.ai_provider === 'cloud' ? 'rgba(16,185,129,0.12)' : 'transparent',
                  color: info.ai_provider === 'cloud' ? 'var(--green)' : 'inherit',
                  fontWeight: 600,
                }}
              >
                ☁️ 千问云端
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title"><span className="dot" />AI 模型（升级路径）</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          本地大模型可在运行中一键切换，无需重启后端（B1）。档位越高复核/解释质量越好，但需更多显存；
          目标模型未安装时状态会提示执行 <code>ollama pull</code>。
        </p>
        {!models ? (
          <div className="skeleton" style={{ height: 80 }} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {models.candidates.map((c) => (
              <div
                key={c.name}
                style={{
                  border: '1px solid',
                  borderColor: c.active ? 'var(--green)' : 'var(--border, #e5e7eb)',
                  borderRadius: 12,
                  padding: 14,
                  background: c.active ? 'rgba(16,185,129,0.08)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 14 }}>{c.name}</strong>
                  {c.active && <span className="badge" style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>当前</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                  <div>参数量：{c.params} · 最低内存 {c.min_ram}</div>
                  <div>最低显存：{c.min_vram}</div>
                  <div style={{ marginTop: 4 }}>{c.note}</div>
                  <div style={{ marginTop: 6 }}>
                    本地状态：
                    {c.present
                      ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>已安装</span>
                      : <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>未安装（需 ollama pull）</span>}
                  </div>
                </div>
                <button
                  className="btn"
                  style={{ marginTop: 10, width: '100%' }}
                  disabled={c.active || switching === c.name}
                  onClick={() => handleSwitch(c.name)}
                >
                  {switching === c.name ? '切换中…' : c.active ? '使用中' : '切换为这个'}
                </button>
              </div>
            ))}
          </div>
        )}
        {switchMsg && (
          <div style={{ marginTop: 12, fontSize: 13, padding: '8px 12px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f655' }}>
            {switchMsg}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title"><span className="dot" />风险判定规则</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>系统依据以下关键词进行风险分级，规则引擎作为确定性真相源，保证离线可复现、可解释。</p>
        {Object.entries(keywords).map(([level, words]) => (
          <div key={level} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: RISK_COLOR[level], marginBottom: 6 }}>
              {level === 'high' ? '🔴 高危' : level === 'medium' ? '🟡 中危' : '🟢 低危'}（{words.length} 词）
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {words.map((w) => (
                <span key={w} className="badge" style={{ borderColor: RISK_COLOR[level], color: RISK_COLOR[level] }}>{w}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="section-title"><span className="dot" />快速入口</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <button className="btn" onClick={() => navigate('/users')}>🗂️ 用户管理</button>
          <button className="btn" onClick={() => navigate('/students')}>👥 学员管理</button>
          <button className="btn" onClick={() => navigate('/teacher')}>🛠️ 教学创作台</button>
        </div>
      </div>
    </div>
  )
}
