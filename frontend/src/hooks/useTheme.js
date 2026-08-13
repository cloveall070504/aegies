import { useEffect } from 'react'
import useThemeStore from '../store/themeStore'

export function useTheme() {
  const { theme, toggleTheme, setTheme } = useThemeStore()

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  return { theme, toggleTheme, setTheme, isWorker: theme === 'worker' }
}
