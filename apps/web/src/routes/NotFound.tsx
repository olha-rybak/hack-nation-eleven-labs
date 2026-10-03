import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="placeholder">
      <h1>Page not found</h1>
      <p>
        <Link to="/capture">Go to Capture</Link>
      </p>
    </div>
  )
}
