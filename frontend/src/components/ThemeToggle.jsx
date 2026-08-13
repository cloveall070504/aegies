import useThemeStore from '../store/themeStore'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()
  return (
    <button
      className="btn-outline"
      onClick={toggleTheme}
      style={{ whiteSpace: 'nowrap' }}
      title="切换学生实验模式 / 工人车间模式"
    >
      {theme === 'student' ? '🎓 学生模式' : '🏭 工人车间模式'}
    </button>
  )
}
