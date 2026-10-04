import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { DEMO_SESSION, lastSession } from '../lib/lastSession'
import { ThemeToggle } from './ThemeToggle'

export function Shell() {
  useLocation() // re-read the last session on every navigation
  const last = lastSession()
  const session = encodeURIComponent(last)
  return (
    <div className="shell">
      <header className="globalnav">
        <Link to="/capture" className="brand">
          AI Apprentice
        </Link>
        <nav aria-label="Modules">
          <NavLink to="/capture">Capture</NavLink>
          {/* Back into the last session's debrief; it resumes at the next open question. */}
          {last !== DEMO_SESSION && <NavLink to={`/debrief/${session}`}>Debrief</NavLink>}
          <NavLink to={`/vault/${session}`}>Vault</NavLink>
          <NavLink to={`/teach/${session}`}>Teach</NavLink>
        </nav>
        <div className="globalnav-end">
          <a className="globalnav-app" href="/shop" target="_blank" rel="noreferrer">
            Returns desk
          </a>
          <ThemeToggle />
        </div>
      </header>
      <Outlet />
    </div>
  )
}
