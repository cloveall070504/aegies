/**
 * 未来后果动画组件（分镜动画剧版）
 *
 * 把「当前动作 → 危险发生 → 事故 → 受伤」演成一段连贯的分镜动画：
 * - 实验室场景（实验台 + 器材 + 人物/手部剪影）
 * - 时间轴连续推进，镜头随剧情切换
 * - 旁白以文字气泡随剧情出现
 * - 底部保留分镜导航，可点选回看任意一幕
 *
 * 动画内容仍由规则引擎（唯一事实源）确定性生成：器材主体 + 效果类型来自
 * 命中的风险点（consequence + level），非 AI 编造。
 */
import { useEffect, useMemo, useRef, useState } from 'react'

const LEVEL_COLOR = { high: '#e5484d', medium: '#f59e0b', low: '#10b981', none: '#64748b' }

const _EFFECT_MAP = [
  ['暴沸', '喷溅'], ['喷溅', '喷溅'], ['飞溅', '喷溅'], ['溅出', '喷溅'],
  ['炸裂', '炸裂'], ['爆炸', '炸裂'], ['爆燃', '爆燃'], ['燃烧', '爆燃'],
  ['着火', '爆燃'], ['火灾', '爆燃'], ['明火', '爆燃'],
  ['倒吸', '倒吸'], ['触电', '触电'], ['中毒', '中毒'], ['有毒', '中毒'],
  ['灼伤', '灼伤'], ['烫伤', '灼伤'], ['腐蚀', '腐蚀'], ['污染', '污染'],
  ['泄漏', '泄漏'], ['自燃', '爆燃'],
]

const _SUBJECT_MAP = [
  ['暴沸', '试管'], ['喷溅', '试管'], ['飞溅', '试管'], ['炸裂', '烧瓶'], ['爆炸', '烧瓶'],
  ['爆燃', '酒精灯'], ['着火', '酒精灯'], ['燃烧', '酒精灯'], ['倒吸', '导管'],
  ['触电', '插座'], ['中毒', '通风橱'], ['有毒', '通风橱'], ['灼伤', '皮肤'],
  ['烫伤', '皮肤'], ['腐蚀', '试剂瓶'], ['泄漏', '试剂瓶'], ['污染', '废液桶'], ['自燃', '酒精灯'],
]

function pickEffect(c) { if (!c) return '无'; for (const [k, e] of _EFFECT_MAP) if (c.includes(k)) return e; return '隐患' }
function pickSubject(c, b) { for (const [k, s] of _SUBJECT_MAP) if ((c || '').includes(k)) return s; const t = b || ''; for (const [k, s] of _SUBJECT_MAP) if (t.includes(k)) return s; return '烧杯' }
function intensityOf(l) { return { high: 3, medium: 2, low: 1, none: 0 }[l] ?? 1 }

// 分镜叙事：每个 effect 一段「事故剧本」，含旁白气泡文案
const STORY = {
  喷溅: { bubbles: ['你正加热试管，管口朝向自己', '液体突然暴沸，高温液滴飞溅而出！', '液滴直冲面部，灼伤眼睛和皮肤'], climax: 'spray' },
  炸裂: { bubbles: ['密闭容器持续加热，压力不断升高', '容器炸裂，碎片向四周迸射！', '玻璃碎片飞溅，割伤与冲击同时袭来'], climax: 'burst' },
  爆燃: { bubbles: ['易燃物靠近明火，未保持安全距离', '瞬间爆燃，火焰猛窜而起！', '火势迅速蔓延，灼伤与火灾风险升级'], climax: 'flame' },
  倒吸: { bubbles: ['排水法收集气体，先撤导管顺序错误', '水沿导管倒吸进入灼热容器！', '容器骤冷炸裂，实验失败且危险'], climax: 'suck' },
  中毒: { bubbles: ['在通风不良处操作挥发性试剂', '有毒气体不断逸散，充斥空间', '吸入毒气，出现头晕与中毒症状'], climax: 'gas' },
  腐蚀: { bubbles: ['腐蚀性试剂未妥善防护操作', '试剂接触皮肤/器材，开始腐蚀', '皮肤灼伤，器材被腐蚀损坏'], climax: 'corrode' },
  触电: { bubbles: ['湿手接触带电设备或插座', '电流瞬间通过身体！', '触电引发肌肉痉挛与灼伤'], climax: 'shock' },
  灼伤: { bubbles: ['高温物体未加防护直接触碰', '皮肤接触高温，瞬间烫伤', '烫伤加重，需立即冲洗就医'], climax: 'burn' },
  泄漏: { bubbles: ['容器密封不严，液体开始渗漏', '液体沿台面扩散，流到不该到的地方', '污染环境，可能引发二次反应'], climax: 'leak' },
  污染: { bubbles: ['废液未分类，直接倒入下水道', '有毒废液污染水体与土壤', '环境受污染，可能面临追责'], climax: 'pollute' },
  隐患: { bubbles: ['操作存在隐患，未被及时察觉', '隐患逐步累积，风险上升', '若不纠正，可能演变为事故'], climax: 'warn' },
}

function buildStory(behavior, level, consequence) {
  const effect = pickEffect(consequence)
  const subject = pickSubject(consequence, behavior)
  const intensity = intensityOf(level)
  if (level === 'none') {
    return {
      title: '操作安全', subject: '烧杯', effect: '安全', intensity: 0,
      bubbles: ['你正在规范地进行操作', '操作安全，未识别到明确风险'],
      climax: 'safe',
    }
  }
  const s = STORY[effect] || STORY.隐患
  return { title: `${subject}${effect}风险演示`, subject, effect, intensity, bubbles: s.bubbles, climax: s.climax }
}

// ============ 器材图标（SVG 精简版，用于场景中）============
function Apparatus({ subject, color, danger }) {
  const c = { stroke: '#5b6472', strokeWidth: 3, fill: 'none' }
  const liquid = danger ? color : '#3d7bd9'
  const shapes = {
    试管: (
      <g transform="translate(100 60)">
        <rect x="-13" y="0" width="26" height="104" rx="12" {...c} fill="rgba(255,255,255,0.55)" />
        <rect x="-13" y="20" width="26" height="36" fill={liquid} opacity="0.55" />
      </g>
    ),
    烧瓶: (
      <g transform="translate(100 68)">
        <rect x="-7" y="-22" width="14" height="26" {...c} />
        <path d="M -28 0 L 28 0 L 11 58 A 11 11 0 0 1 -11 58 Z" {...c} fill="rgba(255,255,255,0.55)" />
        <path d="M -24 6 L 24 6 L 9 50 A 9 9 0 0 1 -9 50 Z" fill={liquid} opacity="0.55" />
      </g>
    ),
    酒精灯: (
      <g transform="translate(100 78)">
        <ellipse cx="0" cy="0" rx="25" ry="8" {...c} fill="rgba(255,255,255,0.55)" />
        <path d="M -19 0 L -8 32 L 8 32 L 19 0 Z" {...c} fill="rgba(255,255,255,0.55)" />
        <rect x="-3" y="32" width="6" height="16" fill="#f6a02e" />
      </g>
    ),
    试剂瓶: (
      <g transform="translate(100 60)">
        <rect x="-7" y="-14" width="14" height="16" {...c} />
        <rect x="-19" y="2" width="38" height="68" rx="4" {...c} fill="rgba(255,255,255,0.55)" />
        <rect x="-19" y="16" width="38" height="54" fill={liquid} opacity="0.5" />
      </g>
    ),
    导管: (
      <g transform="translate(100 78)">
        <path d="M -38 0 L 16 0 L 26 30 L 46 30" {...c} strokeWidth="6" />
      </g>
    ),
    通风橱: (
      <g transform="translate(100 58)">
        <rect x="-48" y="0" width="96" height="88" rx="4" {...c} />
        <rect x="-33" y="13" width="66" height="62" rx="2" fill="rgba(200,220,240,0.4)" />
      </g>
    ),
    插座: (
      <g transform="translate(100 76)">
        <rect x="-32" y="-22" width="64" height="46" rx="6" {...c} fill="rgba(255,255,255,0.6)" />
        <circle cx="-11" cy="1" r="5" fill={liquid} />
        <circle cx="11" cy="1" r="5" fill={liquid} />
      </g>
    ),
    废液桶: (
      <g transform="translate(100 68)">
        <path d="M -27 0 L -21 54 L 21 54 L 27 0 Z" {...c} fill="rgba(255,255,255,0.4)" />
        <path d="M -23 14 L 23 14" stroke={liquid} strokeWidth="4" opacity="0.6" />
      </g>
    ),
    烧杯: (
      <g transform="translate(100 62)">
        <path d="M -28 -8 L 28 -8 L 24 64 L -24 64 Z" {...c} fill="rgba(255,255,255,0.55)" />
        <path d="M -24 6 L 24 6 L 21 56 L -21 56 Z" fill={liquid} opacity="0.5" />
      </g>
    ),
  }
  return shapes[subject] || shapes.烧杯
}

// ============ 精致卡通实验员（含表情/姿态/护目镜/实验服）============
function Person({ mood }) {
  // mood: neutral 正常 / alarm 惊慌 / hurt 受伤
  const armUp = mood === 'alarm' || mood === 'hurt'
  const skin = '#f2c8a0'
  const skinShade = '#e3b088'
  const coat = '#eef2f7'
  const coatShade = '#d7dee8'
  const hair = '#5b4a3f'
  const blush = '#f2a8a0'
  const mouth = mood === 'hurt' ? 'O' : mood === 'alarm' ? 'o' : 'smile'
  const eyeDots = mood === 'hurt' ? true : false

  // 手臂角度：neutral 自然下垂，alarm 举起，hurt 捂脸/举更高
  const armL = armUp ? { x: -22, y: -56 } : { x: -15, y: -20 }
  const armR = armUp ? { x: 22, y: -56 } : { x: 15, y: -20 }

  return (
    <g>
      {/* 头发（后层） */}
      <path d="M -16 -64 Q -16 -78 0 -78 Q 16 -78 16 -64 L 16 -66 Q 16 -72 8 -72 L -8 -72 Q -16 -72 -16 -64 Z" fill={hair} />

      {/* 头 */}
      <circle cx="0" cy="-62" r="17" fill={skin} />
      {/* 头发（前刘海） */}
      <path d="M -17 -62 Q -17 -78 2 -77 Q 17 -76 17 -60 Q 14 -66 6 -67 Q -6 -68 -14 -64 Z" fill={hair} />

      {/* 护目镜 */}
      <rect x="-15" y="-66" width="12" height="9" rx="3" fill="#cfe0f5" stroke="#5b6472" strokeWidth="1.2" />
      <rect x="3" y="-66" width="12" height="9" rx="3" fill="#cfe0f5" stroke="#5b6472" strokeWidth="1.2" />
      <line x1="-3" y1="-61.5" x2="3" y2="-61.5" stroke="#5b6472" strokeWidth="1.2" />
      {/* 眼睛 */}
      {eyeDots ? (
        <g>
          <text x="-9" y="-60" textAnchor="middle" fontSize="8" fill="#5b6472">✕</text>
          <text x="9" y="-60" textAnchor="middle" fontSize="8" fill="#5b6472">✕</text>
        </g>
      ) : (
        <g>
          <circle cx="-9" cy="-60" r="2.2" fill="#333" />
          <circle cx="9" cy="-60" r="2.2" fill="#333" />
        </g>
      )}
      {/* 嘴 */}
      {mouth === 'smile' && <path d="M -5 -53 Q 0 -49 5 -53" stroke="#8b5a4a" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
      {mouth === 'o' && <ellipse cx="0" cy="-52" rx="3" ry="4" fill="#8b5a4a" />}
      {mouth === 'O' && <ellipse cx="0" cy="-52" rx="4" ry="5" fill="#8b5a4a" />}
      {/* 腮红（受伤/惊慌时） */}
      {mood !== 'neutral' && (
        <g>
          <circle cx="-12" cy="-56" r="3" fill={blush} opacity="0.7" />
          <circle cx="12" cy="-56" r="3" fill={blush} opacity="0.7" />
        </g>
      )}

      {/* 身体（实验服） */}
      <path d="M -18 -45 Q 0 -50 18 -45 L 20 2 Q 0 8 -20 2 Z" fill={coat} stroke="#c6ced9" strokeWidth="1" />
      {/* 领口 */}
      <path d="M -8 -45 L 0 -38 L 8 -45 Z" fill="#ffffff" stroke="#c6ced9" strokeWidth="1" />
      {/* 纽扣 */}
      <circle cx="0" cy="-30" r="1.6" fill="#aab4c2" />
      <circle cx="0" cy="-18" r="1.6" fill="#aab4c2" />
      <circle cx="0" cy="-6" r="1.6" fill="#aab4c2" />
      {/* 口袋 */}
      <rect x="7" y="-26" width="9" height="8" rx="2" fill={coatShade} />

      {/* 手臂（含袖管 + 手） */}
      <line x1="-18" y1="-42" x2={armL.x} y2={armL.y} stroke={coat} strokeWidth="9" strokeLinecap="round" />
      <line x1="18" y1="-42" x2={armR.x} y2={armR.y} stroke={coat} strokeWidth="9" strokeLinecap="round" />
      <circle cx={armL.x} cy={armL.y} r="4.5" fill={skin} />
      <circle cx={armR.x} cy={armR.y} r="4.5" fill={skin} />

      {/* 腿 + 鞋 */}
      <line x1="-10" y1="4" x2="-11" y2="24" stroke="#5b6472" strokeWidth="6" strokeLinecap="round" />
      <line x1="10" y1="4" x2="11" y2="24" stroke="#5b6472" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="-12" cy="27" rx="7" ry="3.5" fill="#3a414d" />
      <ellipse cx="12" cy="27" rx="7" ry="3.5" fill="#3a414d" />

      {/* 受伤时的抖动红晕 / 危险提示 */}
      {mood === 'hurt' && (
        <circle cx="0" cy="-40" r="26" fill="none" stroke="#e5484d" strokeWidth="1.5" opacity="0.5" className="cg-hurt-ring" />
      )}
    </g>
  )
}

export default function ConsequenceAnimation({ animation, behavior, level, consequence }) {
  const [act, setAct] = useState(0) // 当前幕：0 动作 1 危险 2 事故/受伤
  const [playing, setPlaying] = useState(true)
  const timerRef = useRef(null)

  const story = useMemo(
    () => animation ? animation : buildStory(behavior, level, consequence),
    [animation, behavior, level, consequence]
  )
  const color = LEVEL_COLOR[level] || '#64748b'
  const acts = story.bubbles || []
  const totalActs = acts.length
  const climax = story.climax
  const danger = act >= 1 && climax !== 'safe'

  // 自动播放
  useEffect(() => {
    if (!playing || totalActs === 0) return
    timerRef.current = setInterval(() => {
      setAct((a) => (a >= totalActs - 1 ? a : a + 1))
    }, 2600)
    return () => clearInterval(timerRef.current)
  }, [playing, totalActs])

  const replay = () => { setAct(0); setPlaying(true) }

  if (totalActs === 0) return null

  const mood = act === 0 ? 'neutral' : (act >= 2 ? 'hurt' : 'alarm')

  return (
    <div className="card" style={{ borderColor: color }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          <span className="dot" style={{ background: color }} />未来后果动画
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge" style={{ borderColor: color, color }}>{story.title}</span>
          <button className="btn-outline chip-btn" onClick={() => setPlaying(p => !p)}>
            {playing ? '⏸ 暂停' : '▶ 播放'}
          </button>
        </div>
      </div>

      {/* 分镜舞台 */}
      <div className="cg-stage" style={{
        borderColor: color,
        background: danger
          ? `radial-gradient(circle at 50% 35%, ${color}1f, transparent 68%)`
          : 'linear-gradient(180deg, #f7f9fc 0%, #eef1f6 100%)',
      }}>
        {/* 顶部：幕次标题 */}
        <div className="cg-act-title" style={{ color }}>
          {['当前动作', '危险发生', '事故 / 受伤'][act] || '未来推演'}
        </div>

        {/* 场景主体 */}
        <div className={`cg-scene ${danger && story.intensity >= 2 ? 'cg-shake' : ''}`}>
          <svg width="280" height="180" viewBox="0 0 200 200">
            {/* 实验台 */}
            <rect x="16" y="168" width="168" height="6" rx="3" fill="#8b97a8" opacity="0.5" />

            {/* 第 1 幕：人物 + 器材（正常） */}
            {act === 0 && (
              <g className="cg-fade-in">
                <g transform="translate(50 141)"><Person mood="neutral" /></g>
                <g transform="translate(150 96) scale(0.72)"><Apparatus subject={story.subject} color={color} danger={false} /></g>
              </g>
            )}

            {/* 第 2 幕：危险发生（器材 + 粒子爆发） */}
            {act >= 1 && (
              <g className="cg-fade-in">
                <g transform="translate(150 96) scale(0.72)"><Apparatus subject={story.subject} color={color} danger /></g>
                <g transform="translate(50 141)"><Person mood="alarm" /></g>
                {/* 粒子特效 */}
                {climax === 'spray' && <SprayParticles color={color} />}
                {climax === 'burst' && <BurstParticles color={color} />}
                {climax === 'flame' && <FlameParticles />}
                {climax === 'gas' && <GasParticles />}
                {climax === 'corrode' && <BubbleParticles color={color} />}
                {climax === 'shock' && <ShockParticles />}
                {climax === 'suck' && <SuckParticles color={color} />}
                {climax === 'leak' && <DripParticles color={color} />}
                {climax === 'pollute' && <DripParticles color="#3d7bd9" />}
                {climax === 'burn' && <FlameParticles small />}
                {climax === 'warn' && <WarnParticles color={color} />}
              </g>
            )}

            {/* 第 3 幕：受伤（人物变红 + 倒地/捂脸） */}
            {act >= 2 && (
              <g className="cg-fade-in">
                <g transform="translate(50 141)"><Person mood="hurt" /></g>
              </g>
            )}

            {/* 安全对勾 */}
            {climax === 'safe' && (
              <path className="cg-safe" d="M72 96 L94 118 L136 74" stroke="#10b981" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </div>

        {/* 旁白气泡 */}
        <div className="cg-bubble" style={{ borderColor: color }}>
          <span className="cg-bubble-arrow" style={{ borderColor: color }} />
          <span className="cg-bubble-text">{acts[Math.min(act, totalActs - 1)]}</span>
        </div>
      </div>

      {/* 分镜导航 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {['当前动作', '危险发生', '事故 / 受伤'].slice(0, totalActs).map((label, i) => (
          <button key={i} onClick={() => { setAct(i); setPlaying(false) }} className="btn-outline chip-btn"
            style={{ flex: 1, borderColor: i === act ? color : undefined, color: i === act ? color : undefined }}>
            {label}
          </button>
        ))}
        <button className="btn-outline chip-btn" onClick={replay}>↺ 重播</button>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        🎬 分镜动画由规则引擎（唯一事实源）确定性生成事故剧本，非 AI 编造；旁白气泡随剧情推进。
      </div>

      <style>{`
        .cg-stage {
          position: relative;
          min-height: 300px;
          border: 1px dashed;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: background 0.6s;
        }
        .cg-act-title {
          position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
          font-size: 14px; font-weight: 700; letter-spacing: 1px; z-index: 2;
        }
        .cg-scene { flex: 1; display: flex; align-items: center; justify-content: center; padding-top: 20px; }
        .cg-bubble {
          position: relative; margin: 0 20px 16px; padding: 10px 16px;
          border: 1px solid; border-radius: 12px; background: var(--card-bg, #fff);
          font-size: 14px; line-height: 1.5; color: var(--text, #1a2230);
        }
        .cg-bubble-arrow {
          position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
          width: 12px; height: 12px; border-left: 1px solid; border-top: 1px solid;
          background: var(--card-bg, #fff); transform: translateX(-50%) rotate(45deg);
        }
        .cg-bubble-text { position: relative; z-index: 1; }

        .cg-fade-in { animation: cg-fade 0.6s ease-out; }
        .cg-shake { animation: cg-shake 0.35s ease-in-out infinite; }

        @keyframes cg-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cg-shake { 0%,100%{transform:translate(0,0)} 25%{transform:translate(-3px,1px)} 75%{transform:translate(3px,-1px)} }

        @keyframes cg-safe { 0%{opacity:0; stroke-dasharray:90; stroke-dashoffset:90} 60%{opacity:1} 100%{stroke-dashoffset:0} }
        .cg-safe { animation: cg-safe 1.2s ease-out forwards; }

        @keyframes cg-hurt-ring { 0%,100%{opacity:0.2; transform:scale(1)} 50%{opacity:0.6; transform:scale(1.15)} }
        .cg-hurt-ring { transform-origin: 0 -40px; animation: cg-hurt-ring 0.8s ease-in-out infinite; }
      `}</style>
    </div>
  )
}

// ============ 各类粒子特效组件 ============
function SprayParticles({ color }) {
  const drops = []
  for (let i = 0; i < 12; i++) drops.push(i)
  return (
    <g>
      {drops.map((i) => (
        <circle key={i} className="p-spray" cx="100" cy="120" r={2.5 + (i % 3)}
          fill={color} style={{ animationDelay: `${(i * 0.08).toFixed(2)}s`, '--dx': `${((i * 37) % 80) - 40}px`, '--dy': `${-40 - (i % 4) * 20}px` }} />
      ))}
      <style>{`@keyframes p-spray{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}.p-spray{animation:p-spray 1s ease-out infinite}`}</style>
    </g>
  )
}

function BurstParticles({ color }) {
  const parts = []
  for (let i = 0; i < 14; i++) parts.push(i)
  return (
    <g>
      {parts.map((i) => {
        const a = (i / 14) * Math.PI * 2
        return (
          <rect key={i} className="p-burst" x="98" y="70" width="5" height="5" rx="1"
            fill={i % 2 ? '#f6a02e' : color}
            style={{ animationDelay: `${(i * 0.05).toFixed(2)}s`, '--dx': `${Math.cos(a) * 75}px`, '--dy': `${Math.sin(a) * 75}px` }} />
        )
      })}
      <style>{`@keyframes p-burst{0%{opacity:0;transform:translate(0,0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(180deg)}}.p-burst{animation:p-burst 0.9s ease-out infinite}`}</style>
    </g>
  )
}

function FlameParticles({ small }) {
  const flames = []
  for (let i = 0; i < (small ? 6 : 9); i++) flames.push(i)
  return (
    <g>
      {flames.map((i) => (
        <ellipse key={i} className="p-flame" cx="100" cy="128" rx={5 + (i % 3) * 2} ry={12 + (i % 4) * 4}
          fill={i % 2 ? '#f6a02e' : '#e5484d'} style={{ animationDelay: `${(i * 0.1).toFixed(2)}s`, '--dx': `${((i * 29) % 60) - 30}px` }} />
      ))}
      <style>{`@keyframes p-flame{0%,100%{opacity:0.6;transform:translate(0,0) scaleY(0.7)}50%{opacity:1;transform:translate(var(--dx),-28px) scaleY(1.3)}}.p-flame{transform-origin:center;animation:p-flame 0.9s ease-in-out infinite}`}</style>
    </g>
  )
}

function GasParticles() {
  const gas = []
  for (let i = 0; i < 7; i++) gas.push(i)
  return (
    <g>
      {gas.map((i) => (
        <circle key={i} className="p-gas" cx="100" cy="70" r={8 + i * 3} fill="rgba(120,220,120,0.5)"
          style={{ animationDelay: `${(i * 0.14).toFixed(2)}s` }} />
      ))}
      <style>{`@keyframes p-gas{0%{opacity:0;transform:scale(0.4)}30%{opacity:0.6}100%{opacity:0;transform:scale(1.8) translateY(-22px)}}.p-gas{transform-origin:100px 70px;animation:p-gas 1.8s ease-out infinite}`}</style>
    </g>
  )
}

function BubbleParticles({ color }) {
  const b = []
  for (let i = 0; i < 10; i++) b.push(i)
  return (
    <g>
      {b.map((i) => (
        <circle key={i} className="p-bubble" cx={100 + ((i * 53) % 60) - 30} cy="120" r={2 + (i % 3)}
          fill={color} style={{ animationDelay: `${(i * 0.18).toFixed(2)}s` }} />
      ))}
      <style>{`@keyframes p-bubble{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-38px)}}.p-bubble{animation:p-bubble 1.4s ease-out infinite}`}</style>
    </g>
  )
}

function ShockParticles() {
  const s = []
  for (let i = 0; i < 6; i++) s.push(i)
  return (
    <g>
      {s.map((i) => (
        <path key={i} className="p-shock" d="M0 0 L8 -12 L2 -12 L10 -26 L4 -26 L12 -40"
          stroke="#ffe066" strokeWidth="2.5" fill="none" transform={`translate(${96 + ((i * 31) % 40) - 20} ${50 + i * 0})`}
          style={{ animationDelay: `${(i * 0.13).toFixed(2)}s` }} />
      ))}
      <style>{`@keyframes p-shock{0%,100%{opacity:0}40%,60%{opacity:1}}.p-shock{animation:p-shock 0.5s step-end infinite}`}</style>
    </g>
  )
}

function SuckParticles({ color }) {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} className="p-suck" x="96" y="70" width="8" height="16" rx="3"
          fill={color} style={{ animationDelay: `${(i * 0.15).toFixed(2)}s` }} />
      ))}
      <style>{`@keyframes p-suck{0%{opacity:0;transform:translateY(-20px)}30%{opacity:1}100%{opacity:0;transform:translateY(50px)}}.p-suck{animation:p-suck 1.1s ease-in infinite}`}</style>
    </g>
  )
}

function DripParticles({ color }) {
  const d = []
  for (let i = 0; i < 7; i++) d.push(i)
  return (
    <g>
      {d.map((i) => (
        <circle key={i} className="p-drip" cx={100 + ((i * 47) % 70) - 35} cy="95" r="3"
          fill={color} style={{ animationDelay: `${(i * 0.16).toFixed(2)}s` }} />
      ))}
      <style>{`@keyframes p-drip{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0.3;transform:translateY(60px)}}.p-drip{animation:p-drip 1.3s ease-in infinite}`}</style>
    </g>
  )
}

function WarnParticles({ color }) {
  return (
    <g>
      <text className="p-warn" x="100" y="70" textAnchor="middle" fontSize="40" fill={color}>!</text>
      <style>{`@keyframes p-warn{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}.p-warn{animation:p-warn 0.9s ease-in-out infinite}`}</style>
    </g>
  )
}
