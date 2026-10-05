import { Link } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'

/**
 * Phase 16 — production hardening / SEO. Previously every unmatched path
 * silently redirected to "/" (App.jsx's old catch-all `<Navigate to="/" />`),
 * which returns a 200 for a broken link and confuses both users (no
 * indication anything was wrong) and search engines (soft-404 — an
 * unhelpful signal). This renders an actual 404 message; App.jsx's
 * catch-all route now points here instead of redirecting.
 */
export default function NotFound() {
  useSeo({ title: 'Page Not Found | SSzentronics', noindex: true })

  return (
    <div className="container-aura py-20 text-center">
      <p className="text-sm uppercase tracking-wide text-ink-soft mb-2">404</p>
      <h1 className="text-3xl font-medium mb-4">Page not found</h1>
      <p className="text-ink-soft mb-8 max-w-md mx-auto">
        We couldn&rsquo;t find the page you were looking for. It may have moved, or the link may be out of date.
      </p>
      <div className="flex items-center justify-center gap-4">
        <Link to="/" className="btn-lavender inline-block w-auto px-8">
          Back to home
        </Link>
        <Link to="/shop" className="btn-outline inline-block w-auto px-8">
          Shop all products
        </Link>
      </div>
    </div>
  )
}
