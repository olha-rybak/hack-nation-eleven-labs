import { useTheme } from '../lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button type="button" className="theme-toggle glass" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" fill="currentColor" />
          <path
            d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M15.8 12.6A6.6 6.6 0 0 1 7.4 4.2a6.6 6.6 0 1 0 8.4 8.4z" fill="currentColor" />
        </svg>
      )}
    </button>
  )
}
