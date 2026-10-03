import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'theme'
const systemDark = () => matchMedia('(prefers-color-scheme: dark)')

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function resolved(): Theme {
  return stored() ?? (systemDark().matches ? 'dark' : 'light')
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

// Follows the system until the user picks a theme; the pick is remembered.
// index.html applies the saved pick before first paint.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolved)

  useEffect(() => {
    const media = systemDark()
    const onChange = () => {
      if (stored()) return
      const next = media.matches ? 'dark' : 'light'
      setTheme(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Not remembering the choice is acceptable.
    }
    const swap = () => {
      apply(next)
      setTheme(next)
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce && 'startViewTransition' in document) {
      document.startViewTransition(swap)
    } else {
      swap()
    }
  }

  return { theme, toggle }
}
