import { NavLink, Outlet } from 'react-router'

const DEMO_ID = 'demo'

export function Shell() {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">AI Apprentice</span>
        <nav className="modes" aria-label="Modules">
          <NavLink to="/capture">Capture</NavLink>
          <NavLink to={`/map/${DEMO_ID}`}>Work Map</NavLink>
          <NavLink to={`/teach/${DEMO_ID}`}>Teach</NavLink>
        </nav>
        <a className="button small" href="/erp" target="_blank" rel="noreferrer">
          Open ERP
        </a>
      </header>
      <Outlet />
    </div>
  )
}
