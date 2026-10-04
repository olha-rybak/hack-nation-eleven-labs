import { Link, NavLink, Outlet } from 'react-router'
import { ThemeToggle } from './ThemeToggle'

const DEMO_ID = 'demo-brandt'

export function Shell() {
  return (
    <div className="shell">
      <header className="globalnav">
        <Link to="/capture" className="brand">
          AI Apprentice
        </Link>
        <nav aria-label="Modules">
          <NavLink to="/capture">Capture</NavLink>
          <NavLink to={`/map/${DEMO_ID}`}>Work Map</NavLink>
          <NavLink to={`/vault/${DEMO_ID}`}>Vault</NavLink>
          <NavLink to={`/teach/${DEMO_ID}`}>Teach</NavLink>
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
