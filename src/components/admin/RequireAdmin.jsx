import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getMyProfile } from '../../repositories/customers.repository'

function readIsAdmin(profile) {
  if (!profile) return false
  return Boolean(profile.isAdmin ?? profile.is_admin)
}

/**
 * Gates the /admin/* route tree. Prefer a fresh profiles.is_admin read via
 * RLS; fall back to AuthContext profile if the direct query fails (e.g.
 * Edge Function not deployed / transient PostgREST error).
 */
export default function RequireAdmin({ children }) {
  const { isAuthenticated, initializing, configured, profile: authProfile, session } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState('checking') // 'checking' | 'admin' | 'not-admin' | 'error'
  const [errorDetail, setErrorDetail] = useState('')

  useEffect(() => {
    if (!configured || initializing || !isAuthenticated) return
    let cancelled = false
    setStatus('checking')
    setErrorDetail('')

    ;(async () => {
      try {
        const profile = await getMyProfile()
        if (cancelled) return
        if (readIsAdmin(profile)) {
          setStatus('admin')
          return
        }
        // No row yet, or not flagged — try AuthContext (edge link may have it)
        if (readIsAdmin(authProfile)) {
          setStatus('admin')
          return
        }
        setStatus('not-admin')
      } catch (err) {
        if (cancelled) return
        // Direct query failed; still allow if AuthContext already knows admin
        if (readIsAdmin(authProfile)) {
          setStatus('admin')
          return
        }
        setErrorDetail(err?.message || 'Profile lookup failed.')
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [configured, initializing, isAuthenticated, authProfile, session?.user?.id])

  if (!configured) {
    // The rest of the console stays closed without a staff account.
    // Influencer promo codes are stored on this device and are the one
    // admin tool available before Supabase is connected.
    if (location.pathname.startsWith('/admin/promotions/influencers') || location.pathname.startsWith('/admin/content')) {
      return children
    }
    if (location.pathname === '/admin') {
      return <Navigate to="/admin/promotions/influencers" replace />
    }
    return (
      <div className="container-aura py-24 text-center">
        <h1 className="text-2xl font-medium font-display mb-3">Staff sign-in required</h1>
        <p className="text-ink-soft mb-6">That part of the admin console needs a connected store account. Storefront copy and influencer codes can be edited before that.</p>
        <a href="/admin/content" className="btn-lavender inline-block w-auto px-8 mr-3">
          Edit storefront
        </a>
        <a href="/admin/promotions/influencers" className="btn-lavender inline-block w-auto px-8">
          Influencer promo codes
        </a>
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
        <p className="text-ink-soft mb-4">This area is limited to SSzentronics staff accounts.</p>
        <p className="text-ink-soft text-sm">
          Signed in as {session?.user?.email}. Run <code>supabase/ensure-admin.sql</code> in the SQL Editor, then refresh.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="container-aura py-24 text-center">
        <h1 className="text-2xl font-medium font-display mb-3">Could not verify admin access</h1>
        <p className="text-ink-soft mb-2">{errorDetail || 'Please refresh and try again.'}</p>
        <p className="text-ink-soft text-sm mb-6">
          Usually this means your <code>profiles</code> row is missing or <code>is_admin</code> is false. Run{' '}
          <code>supabase/ensure-admin.sql</code>, then refresh.
        </p>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    )
  }

  return children
}
