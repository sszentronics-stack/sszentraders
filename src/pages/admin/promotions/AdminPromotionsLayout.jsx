import { NavLink, Outlet } from 'react-router-dom'

/**
 * Promotions/coupon management sub-section, nested inside Phase 12's shared
 * `/admin` shell (AdminLayout + RequireAdmin already gate access and provide
 * the sidebar/padding — see src/App.jsx). Originally built as a standalone
 * layout with its own guard while Phase 12 was still in progress; folded in
 * during the merge once both landed (see docs/phase-12-completion-report.md
 * and docs/phase-13-completion-report.md "Known limitations").
 */
const NAV = [
  { to: '/admin/promotions/campaigns', label: 'Campaigns' },
  { to: '/admin/promotions/promotions', label: 'Promotions' },
  { to: '/admin/promotions/coupons', label: 'Coupons' },
  { to: '/admin/promotions/influencers', label: 'Influencer codes' },
  { to: '/admin/promotions/abandoned-carts', label: 'Abandoned Carts' },
]

export default function AdminPromotionsLayout() {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="text-2xl font-medium font-display">Promotions & Loyalty</h1>
          <p className="text-ink-soft mt-1 text-sm">
            Admin campaign, promotion and coupon management. Discount amounts are always computed server-side — nothing here
            changes how a discount applies without going through the same rule engine the storefront uses.
          </p>
        </div>
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
