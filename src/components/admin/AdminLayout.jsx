import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AdminToastProvider } from '../../context/admin/AdminToastContext'

/**
 * Sidebar/shell for /admin/*. Deliberately does NOT include a "Promotions"
 * entry — Phase 13 (Promotions, Loyalty & Customer Intelligence) is being
 * built concurrently by a separate agent and owns that module + its own
 * nav entry; a later integration pass folds it in here. See
 * docs/phase-12-completion-report.md "Known limitations" for the tracking
 * note.
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
