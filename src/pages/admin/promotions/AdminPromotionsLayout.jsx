import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'

/**
 * Standalone admin layout for Phase 13's promotions/coupon management UI.
 *
 * Phase 12 (Admin Operations Dashboard) is being built concurrently in a
 * separate worktree and may not have merged a shared `/admin/*` shell/
 * AdminLayout by the time this ships — see docs/phase-13-completion-report.md's
 * known limitations. Rather than guess at Phase 12's file layout, this is a
 * deliberately self-contained route with its own minimal admin guard and
 * nav, reusing the existing Aura visual tokens (container-aura, form-input,
 * btn-lavender, etc.) rather than inventing a new design language. A
 * follow-up integration pass should fold this into Phase 12's shared admin
 * nav once both are merged.
 */
const NAV = [
  { to: '/admin/promotions/campaigns', label: 'Campaigns' },
  { to: '/admin/promotions/promotions', label: 'Promotions' },
  { to: '/admin/promotions/coupons', label: 'Coupons' },
  { to: '/admin/promotions/abandoned-carts', label: 'Abandoned Carts' },
]

export default function AdminPromotionsLayout() {
  const { isAuthenticated, initializing, profile, configured } = useAuth()

  if (!configured) {
    return <div className="container-aura py-16 text-center text-ink-soft">Admin tools are not available yet.</div>
  }
  if (initializing) {
    return <div className="container-aura py-24 text-center text-ink-soft"><span className="spinner" /></div>
  }
  if (!isAuthenticated) {
    return <Navigate to="/login?redirect=/admin/promotions" replace />
  }
  if (!profile?.isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="container-aura py-12 md:py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-medium font-display">Promotions & Loyalty</h1>
        <p className="text-ink-soft mt-1 text-sm">
          Admin campaign, promotion and coupon management. Discount amounts are always computed server-side — nothing here changes
          how a discount applies without going through the same rule engine the storefront uses.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 mb-8 border-b border-line">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `px-4 py-2 text-sm font-medium ${isActive ? 'border-b-2' : 'text-ink-soft'}`}
            style={({ isActive }) => (isActive ? { borderColor: '#102b26', color: '#102b26' } : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
