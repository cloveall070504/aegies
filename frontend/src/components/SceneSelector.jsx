/**
 * 场景选择器：替代原"学生模式/工人模式"的主题切换。
 * - 下拉框选择任意场景（内置+自定义）
 * - 切换场景时自动更新 sceneStore.currentScene 和 themeStore.theme
 * - 每个场景自带的 icon/名/主题样式
 * - 顶部带"分步骤模拟"和"培训报告"入口
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useSceneStore from '../store/sceneStore'
import useThemeStore from '../store/themeStore'
import { listScenes } from '../api/scenes'
import { useCurrentScene } from '../hooks/useSceneType'

const LEVEL_COLOR = { high: 'var(--red)', medium: 'var(--yellow)', low: 'var(--green)' }

export default function SceneSelector({ compact = false, variant = 'default' }) {
  const navigate = useNavigate()
  const currentScene = useCurrentScene()
  const scenes = useSceneStore((s) => s.scenes)
  const setScenes = useSceneStore((s) => s.setScenes)
  const setCurrentScene = useSceneStore((s) => s.setCurrentScene)
  const refreshScenesIfStale = useSceneStore((s) => s.refreshScenesIfStale)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const allowed = await refreshScenesIfStale(listScenes)
        // 如果当前 scene 不在允许列表里，切换到化学实验
        if (allowed.length && !allowed.find((s) => s.scene_code === currentScene?.scene_code)) {
          const first = allowed[0]
          setCurrentScene(first)
          setTheme(first.theme_name)
        }
      } catch (_) {
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPick = (s) => {
    setCurrentScene(s)
    setTheme(s.theme_name)
    setOpen(false)
  }

  if (compact) {
    return (
      <div className="scene-selector compact" style={{ position: 'relative', display: 'inline-block' }}>
        <button className="scene-trigger scene-trigger--sm" onClick={() => setOpen(!open)}>
          <span className="scene-trigger__icon">{currentScene?.icon}</span>
          <span className="scene-trigger__name">{currentScene?.name || '选择场景'}</span>
          <span className="scene-trigger__caret">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <DropdownList scenes={scenes} current={currentScene} loading={loading} onPick={onPick} />
        )}
      </div>
    )
  }

  // default variant：大卡片式，带场景详情和入口
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <button
            className="scene-trigger scene-trigger--lg"
            onClick={() => setOpen(!open)}
          >
            <span className="scene-trigger__icon">{currentScene?.icon}</span>
            <span className="scene-trigger__name">{currentScene?.name || '加载场景…'}</span>
            <span className="scene-trigger__caret">{open ? '▲' : '切换场景 ▼'}</span>
          </button>
          {loading && <span className="spinner" />}
          {open && (
            <div className="scene-dropdown scene-dropdown-panel" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50, minWidth: 280, maxHeight: 360, overflowY: 'auto' }}>
              {scenes.length === 0 && <div className="muted" style={{ padding: 10 }}>场景加载中…</div>}
              {scenes.map((s) => (
                <button
                  key={s.scene_code}
                  className={`scene-dropdown-item ${s.scene_code === currentScene?.scene_code ? 'active' : ''}`}
                  onClick={() => onPick(s)}
                  style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                >
                  <span style={{ fontSize: 18 }}>{s.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {s.builtin ? '内置场景' : '自定义'} · 化学实验
                    </div>
                  </div>
                  {s.scene_code === currentScene?.scene_code && <span className="scene-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            当前场景：{currentScene?.description || '化学实验'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="chip-btn btn-outline" onClick={() => navigate(`/sim/${currentScene?.scene_code || 'chem_lab'}/pre`)}>
            🎯 预考
          </button>
          <button className="chip-btn btn-outline" onClick={() => navigate(`/sim/${currentScene?.scene_code || 'chem_lab'}/sim`)}>
            🧩 分步骤模拟
          </button>
          <button className="chip-btn btn-outline" onClick={() => navigate(`/training/${currentScene?.scene_code || 'chem_lab'}`)}>
            📊 培训报告
          </button>
        </div>
      </div>
    </div>
  )
}

function DropdownList({ scenes, current, loading, onPick }) {
  if (loading) return <div className="scene-dropdown-list"><div className="skeleton" style={{ height: 30 }} /></div>
  return (
    <div
      className="scene-dropdown-list scene-dropdown-panel"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 6,
        minWidth: 220,
        maxHeight: 320,
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      {scenes.map((s) => (
        <button
          key={s.scene_code}
          className={`scene-dropdown-item ${s.scene_code === current?.scene_code ? 'active' : ''}`}
          onClick={() => onPick(s)}
          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <span>{s.icon}</span>
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
          {s.scene_code === current?.scene_code && <span className="scene-check">✓</span>}
        </button>
      ))}
    </div>
  )
}
