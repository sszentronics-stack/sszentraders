import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getMyProfile } from '../../repositories/customers.repository'

/**
 * Gates the /admin/* route tree. Deliberately does NOT trust
 * AuthContext's `profile` (populated from the `auth` Edge Function's
 * snake_case row and only refreshed on sign-in) — instead it re-reads the
 * caller's own profile row directly via RLS
 * (profiles_self_read/profiles_admin_all, 0014_row_level_security.sql) so
 * the admin flag is always freshly server-verified on every mount. This is
 * a client-side UX gate only: every admin mutation is re-checked
 * server-side by requireAdmin() in the Edge Functions themselves (see
 * supabase/functions/_shared/adminAuth.ts) — this component cannot be the
 * only thing standing between a non-admin and a privileged action.
 */
export default function RequireAdmin({ children }) {
  const { isAuthenticated, initializing, configured } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState('checking') // 'checking' | 'admin' | 'not-admin' | 'error'

  useEffect(() => {
    if (!configured || initializing || !isAuthenticated) return
    let cancelled = false
    setStatus('checking')
    getMyProfile()
      .then((profile) => {
        if (cancelled) return
        setStatus(profile?.isAdmin ? 'admin' : 'not-admin')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [configured, initializing, isAuthenticated])

  if (!configured) {
    return (
      <div className="container-aura py-24 text-center">
        <p className="text-ink-soft">The admin dashboard is not available yet.</p>
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

  if (status === 'checking') {
    return (
      <div className="container-aura py-24 text-center text-ink-soft">
        <span className="spinner" style={{ borderTopColor: '#c98a7d', borderColor: 'rgba(201,138,125,0.25)' }} />
      </div>
    )
  }

  if (status === 'not-admin') {
    return (
      <div className="container-aura py-24 text-center">
        <h1 className="text-2xl font-medium font-display mb-3">Restricted</h1>
        <p className="text-ink-soft">This area is limited to Aura staff accounts.</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="container-aura py-24 text-center">
        <p className="text-ink-soft">Could not verify admin access. Please refresh and try again.</p>
      </div>
    )
  }

  return children
}
