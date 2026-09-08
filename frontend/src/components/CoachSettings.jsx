import { useEffect, useState } from 'react'
import {
  coachProfile, coachWeakReminder, coachBadges,
  coachSetPrefs, coachInterrupt, topicLabel,
} from '../api/coach'
import { setSpeechRate, setBargeInEnabled, isBargeInEnabled, setForceEdgeTTS, isForceEdgeTTS } from '../utils/speechController'

/**
 * 教练设置抽屉（CompanionChat 右上 ⚙️ 展开）。
 *
 * 收编原来"教练面板"里的低频配置项——高频教练能力（苏格拉底/渐进提示/
 * 错因归因）已在对话流内自动触发，这里只留：薄弱点画像、成就徽章、
 * 形象/声音偏好、自动语音打断开关。摄像头纠错在独立「视觉纠错」标签。
 */
export default function CoachSettings({ onClose }) {
  const [profile, setProfile] = useState(null)
  const [reminder, setReminder] = useState('')
  const [badges, setBadges] = useState({ catalog: [], owned: [] })
  const [bargeIn, setBargeIn] = useState(isBargeInEnabled())
  const [forceEdge, setForceEdge] = useState(isForceEdgeTTS())
  const [prefs, setPrefs] = useState({ gender: '', voice_type: '', speech_rate: '', avatar: '' })
  const [prefsMsg, setPrefsMsg] = useState('')

  const flash = (msg) => {
    setPrefsMsg(msg)
    setTimeout(() => setPrefsMsg(''), 3000)
  }

  useEffect(() => {
    coachProfile().then((p) => {
      setProfile(p)
      const pr = p?.prefs || {}
      setPrefs({
        gender: pr.gender || '',
        voice_type: pr.voice_type || '',
        speech_rate: pr.speech_rate != null ? String(pr.speech_rate) : '',
        avatar: pr.avatar || '',
      })
    }).catch(() => {})
    coachWeakReminder('').then((d) => setReminder(d?.reminder || '')).catch(() => {})
    coachBadges().then(setBadges).catch(() => {})
  }, [])

  const ownedSet = new Set(badges.owned || [])

  const onSavePrefs = async () => {
    const clean = {}
    if (prefs.gender) clean.gender = prefs.gender
    if (prefs.voice_type) clean.voice_type = prefs.voice_type
    if (prefs.speech_rate !== '' && !Number.isNaN(Number(prefs.speech_rate))) {
      clean.speech_rate = Number(prefs.speech_rate)
      setSpeechRate(Number(prefs.speech_rate))
    }
    if (prefs.avatar) clean.avatar = prefs.avatar
    try {
      await coachSetPrefs(clean)
      flash('已保存形象/声音偏好并生效')
    } catch (e) {
      flash('保存失败：' + (e.message || ''))
    }
  }

  const toggleBargeIn = () => {
    const next = !bargeIn
    setBargeIn(next)
    setBargeInEnabled(next)
    if (next) coachInterrupt().catch(() => {})
  }

  const toggleForceEdge = () => {
    const next = !forceEdge
    setForceEdge(next)
    setForceEdgeTTS(next)
    flash(next ? '已强制晓晓（后端合成）' : '已切换自动选择音色')
  }

  return (
    <div className="coach-panel">
      <div className="coach-settings-head">
        <span className="coach-settings-title">教练设置</span>
        <button type="button" className="cc-icon-btn" onClick={onClose} title="返回对话">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      </div>
      {prefsMsg && <div className="coach-toast">{prefsMsg}</div>}

      {/* 薄弱点 + 提醒 */}
      <section className="coach-sec">
        <h4 className="coach-sec__h">我的薄弱点</h4>
        {reminder && <div className="coach-remind">{reminder}</div>}
        {!reminder && (
          <div className="coach-empty">暂无跨场景薄弱点记录。在对话里描述操作被纠错后，就会开始累计。</div>
        )}
        {profile?.weak_topics?.length > 0 && (
          <div className="coach-tags">
            {profile.weak_topics.map((w) => (
              <span key={w.topic} className="coach-tag">{topicLabel(w.topic)} ×{w.count}</span>
            ))}
          </div>
        )}
        <div className="coach-empty" style={{ marginTop: 6 }}>
          已推演 <b>{profile?.experiments_done ?? 0}</b> 次 · 规避 <b>{profile?.incidents_avoided ?? 0}</b> 次风险
        </div>
      </section>

      {/* 成就徽章 */}
      <section className="coach-sec">
        <h4 className="coach-sec__h">成就徽章</h4>
        <div className="coach-badges">
          {badges.catalog.map((b) => (
            <span key={b.code} className={`coach-badge ${ownedSet.has(b.code) ? 'owned' : 'locked'}`} title={b.desc}>
              {b.icon} {b.name}
            </span>
          ))}
        </div>
        <div className="coach-empty">完成操作推演 / 高危纠错会自动解锁，不需要手动操作。</div>
      </section>

      {/* 形象 / 声音 */}
      <section className="coach-sec">
        <h4 className="coach-sec__h">形象 / 声音定制</h4>
        <div className="coach-row">
          <label>性别
            <select className="coach-input" value={prefs.gender} onChange={(e) => setPrefs({ ...prefs, gender: e.target.value })}>
              <option value="">不限定</option><option value="女">女声</option><option value="男">男声</option>
            </select>
          </label>
          <label>音色
            <select className="coach-input" value={prefs.voice_type} onChange={(e) => setPrefs({ ...prefs, voice_type: e.target.value })}>
              <option value="">默认</option><option value="xiaoxiao">晓晓</option><option value="yunxi">云希</option>
            </select>
          </label>
        </div>
        <div className="coach-row">
          <label>语速倍率
            <input className="coach-input" type="number" step="0.05" min="0.7" max="1.3" value={prefs.speech_rate}
              onChange={(e) => setPrefs({ ...prefs, speech_rate: e.target.value })} />
          </label>
          <label>形象
            <select className="coach-input" value={prefs.avatar} onChange={(e) => setPrefs({ ...prefs, avatar: e.target.value })}>
              <option value="">默认</option><option value="light">清爽</option><option value="warm">温暖</option>
            </select>
          </label>
        </div>
        <button type="button" className="coach-btn" onClick={onSavePrefs}>保存偏好</button>
      </section>

      {/* 自动语音打断 */}
      <section className="coach-sec">
        <h4 className="coach-sec__h">自动语音打断</h4>
        <label className="coach-switch">
          <input type="checkbox" checked={bargeIn} onChange={toggleBargeIn} />
          开启后，数字人说话时你开口，它会立刻停下来听你讲（barge-in）
        </label>
      </section>

      {/* 声音引擎（音色兜底） */}
      <section className="coach-sec">
        <h4 className="coach-sec__h">声音引擎</h4>
        <label className="coach-switch">
          <input type="checkbox" checked={forceEdge} onChange={toggleForceEdge} />
          强制晓晓（后端合成）
        </label>
        <p className="coach-empty" style={{ marginTop: 6 }}>
          {forceEdge
            ? '已强制走后端晓晓/云希合成。若网络不佳可能稍慢或短暂静音，但音色最稳定自然。'
            : '自动选择：浏览器有自然中文音就用浏览器（快）；否则用后端晓晓。若觉得声音"机械"，请开启此项。'}
        </p>
      </section>
    </div>
  )
}
