import { useState } from 'react'
import useDigitalHumanStore from '../store/digitalHumanStore'

// 学生端功能：直接复用已有页面组件（UI 与接口都不重写），只是在右侧内联打开，不再切换路由
import Dashboard from '../pages/PC/Dashboard'
import Sandbox from '../pages/PC/Sandbox'
import Assignments from '../pages/PC/Assignments'
import Cases from '../pages/PC/Cases'
import Profile from '../pages/PC/Profile'
import TrainingOverview from '../pages/PC/TrainingOverview'
import Docs from '../pages/PC/Docs'

const FEATURES = [
  { key: 'sandbox', label: '避错沙盘', hint: '推演操作后果', Comp: Sandbox, say: '打开避错沙盘。你可以先操作，我来告诉你后果和正确做法。' },
  { key: 'training', label: '学习中心', hint: '分步骤模拟训练', Comp: TrainingOverview, say: '这是你的学习中心，按场景一步步练，我会盯着每一步。' },
  { key: 'cases', label: '案例库', hint: '真实事故复盘', Comp: Cases, say: '看看别人踩过的坑，比自己踩一次划算得多。' },
  { key: 'assignments', label: '我的作业', hint: '待完成与批改', Comp: Assignments, say: '这是你的作业，做完的我帮你看看哪里还能更稳。' },
  { key: 'docs', label: '文档管理', hint: '规程与资料', Comp: Docs, say: '规程文档都在这儿，需要我解读哪一段随时说。' },
  { key: 'profile', label: '个人画像', hint: '能力雷达与薄弱项', Comp: Profile, say: '这是你的能力画像，薄弱项我们一起补。' },
  { key: 'dashboard', label: '我的主页', hint: '总览与趋势', Comp: Dashboard, say: '回到主页，这里有你的整体情况。' },
]

export default function FeatureDock({ visible = false, onOpenChange }) {
  const [openKey, setOpenKey] = useState(null)
  const { speak, hush } = useDigitalHumanStore()
  const open = FEATURES.find((f) => f.key === openKey) || null

  const onPick = (f) => {
    const next = openKey === f.key ? null : f.key
    setOpenKey(next)
    // onOpenChange(true|false, 当前模块 label) —— Nexus 用模块名做对话上下文
    if (onOpenChange) onOpenChange(!!next, next ? f.label : '')
    if (next) {
      hush()
      speak(f.say, { ms: 7000 })
    }
  }

  // 外部收起（点关闭按钮）时同步通知
  const closePanel = () => {
    setOpenKey(null)
    if (onOpenChange) onOpenChange(false, '')
  }

  return (
    <>
      <aside className={`dock${visible ? ' dock--visible' : ''}`}>
        <div className="dock__title">功 能</div>
        <div className="dock__list">
          {FEATURES.map((f, i) => (
            <button
              key={f.key}
              type="button"
              className={`dock__card${openKey === f.key ? ' dock__card--active' : ''}`}
              style={{ animationDelay: `${i * 90}ms` }}
              onClick={() => onPick(f)}
            >
              <span className="dock__meta">
                <span className="dock__label">{f.label}</span>
                <span className="dock__hint">{f.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="dock__foot">规则引擎 · 唯一事实源</div>
      </aside>

      {/* 内联功能面板：展开在数字人右侧，数字人始终可见 */}
      <div className={`drawer${open ? ' drawer--open' : ''}`} aria-hidden={!open}>
        {open && (
          <>
            <div className="drawer__head">
              <span className="drawer__title">{open.label}</span>
              <button type="button" className="drawer__close" onClick={closePanel}>
                收起
              </button>
            </div>
            <div className="drawer__body">
              {/* 学习中心内嵌模式：分步培训原地切换，不跳出数字人单页 */}
              {open.key === 'training' ? <TrainingOverview embedded /> : <open.Comp />}
            </div>
          </>
        )}
      </div>
    </>
  )
}
