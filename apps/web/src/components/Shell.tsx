import { Link, NavLink, Outlet } from 'react-router'

const DEMO_ID = 'demo'

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
          <NavLink to={`/teach/${DEMO_ID}`}>Teach</NavLink>
        </nav>
        <a className="globalnav-erp" href="/erp" target="_blank" rel="noreferrer">
          Open ERP
        </a>
      </header>
      <Outlet />
    </div>
  )
}
