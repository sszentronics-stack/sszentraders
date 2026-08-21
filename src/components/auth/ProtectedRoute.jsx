import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/** Redirects to /login?redirect=<intended path> if not signed in, and back afterwards (see Login.jsx). */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, initializing, configured } = useAuth()
  const location = useLocation()

  if (!configured) {
    return (
      <div className="container-aura py-16 text-center">
        <p className="text-ink-soft">Accounts are not available yet. Please check back soon.</p>
      </div>
    )
  }

  if (initializing) {
    return (
      <div className="container-aura py-24 text-center text-ink-soft">
        <span className="spinner" style={{ borderTopColor: '#c98a7d', borderColor: 'rgba(201,138,125,0.25)' }} />
      </div>
    )
  }

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }

  return children
}
