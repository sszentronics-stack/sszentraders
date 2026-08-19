import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AdminToastProvider } from '../../context/admin/AdminToastContext'

/**
 * Sidebar/shell for /admin/*. Includes "Promotions", folded in during the
 * Phase 12 + Phase 13 merge — see docs/phase-12-completion-report.md and
 * docs/phase-13-completion-report.md "Known limitations".
 */
const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/catalog', label: 'Brands & Categories' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/shipments', label: 'Shipments' },
  { to: '/admin/returns', label: 'Returns' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/erp', label: 'ERP Sync' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/promotions', label: 'Promotions' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/audit-log', label: 'Audit Log' },
]

export default function AdminLayout() {
  const { logout, session } = useAuth()

  return (
    <AdminToastProvider>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link to="/admin" className="admin-brand">
            Aura <span>Ops</span>
          </Link>
          <nav className="admin-nav">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="admin-sidebar-footer">
            <p className="admin-sidebar-email">{session?.user?.email}</p>
            <Link to="/" className="admin-sidebar-link">
              View storefront
            </Link>
            <button type="button" className="admin-sidebar-link admin-sidebar-signout" onClick={logout}>
              Sign out
            </button>
          </div>
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </AdminToastProvider>
  )
}
