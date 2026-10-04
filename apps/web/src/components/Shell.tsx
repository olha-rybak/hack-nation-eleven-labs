import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { lastSession } from '../lib/lastSession'
import { ThemeToggle } from './ThemeToggle'

export function Shell() {
  useLocation() // re-read the last session on every navigation
  const session = encodeURIComponent(lastSession())
  return (
    <div className="shell">
      <header className="globalnav">
        <Link to="/capture" className="brand">
          AI Apprentice
        </Link>
        <nav aria-label="Modules">
          <NavLink to="/capture">Capture</NavLink>
          <NavLink to={`/map/${session}`}>Work Map</NavLink>
          <NavLink to={`/vault/${session}`}>Vault</NavLink>
          <NavLink to={`/teach/${session}`}>Teach</NavLink>
        </nav>
        <div className="globalnav-end">
          <a className="globalnav-app" href="/shop" target="_blank" rel="noreferrer">
            Open shop
          </a>
          <ThemeToggle />
        </div>
      </header>
      <Outlet />
    </div>
  )
}
