import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AdminToastProvider } from '../../context/admin/AdminToastContext'
import { useSeo } from '../../hooks/useSeo'

/**
 * Sidebar grouped into collapsible sections so the long flat list doesn't
 * overwhelm the nav. The section that owns the current route stays open.
 */
const NAV_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', end: true }],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { to: '/admin/products', label: 'Products' },
      { to: '/admin/catalog', label: 'Brands & Categories' },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      { to: '/admin/orders', label: 'Orders' },
      { to: '/admin/customers', label: 'Customers' },
      { to: '/admin/payments', label: 'Payments' },
      { to: '/admin/shipments', label: 'Shipments' },
      { to: '/admin/returns', label: 'Returns' },
    ],
  },
  {
    id: 'growth',
    label: 'Growth',
    items: [
      { to: '/admin/reviews', label: 'Reviews' },
      { to: '/admin/promotions', label: 'Promotions' },
      { to: '/admin/reports', label: 'Reports' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { to: '/admin/erp', label: 'ERP Sync' },
      { to: '/admin/inventory', label: 'Inventory' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { to: '/admin/settings', label: 'Settings' },
      { to: '/admin/audit-log', label: 'Audit Log' },
    ],
  },
]

function sectionOwnsPath(section, pathname) {
  return section.items.some((item) => {
    if (item.end) return pathname === item.to
    return pathname === item.to || pathname.startsWith(`${item.to}/`)
  })
}

function activeSectionId(pathname) {
  const match = NAV_SECTIONS.find((section) => sectionOwnsPath(section, pathname))
  return match?.id ?? 'overview'
}

export default function AdminLayout() {
  const { logout, session, configured } = useAuth()
  const { pathname } = useLocation()
  const [openSections, setOpenSections] = useState(() => new Set([activeSectionId(pathname)]))

  useSeo({ title: 'Admin | SS Zen Traders', noindex: true })

  useEffect(() => {
    const current = activeSectionId(pathname)
    setOpenSections((prev) => {
      if (prev.has(current)) return prev
      const next = new Set(prev)
      next.add(current)
      return next
    })
  }, [pathname])

  function toggleSection(id) {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <AdminToastProvider>
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link to="/admin" className="admin-brand">
            SS Zen <span>Ops</span>
          </Link>
          {!configured ? (
            <p className="admin-sidebar-email" style={{ margin: '0 0 0.75rem', opacity: 0.75 }}>
              UI preview (no Supabase)
            </p>
          ) : null}
          <nav className="admin-nav">
            {NAV_SECTIONS.map((section) => {
              const open = openSections.has(section.id)
              const active = sectionOwnsPath(section, pathname)
              return (
                <div key={section.id} className={`admin-nav-section${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="admin-nav-section-toggle"
                    aria-expanded={open}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span>{section.label}</span>
                    <span className="admin-nav-section-chevron" aria-hidden="true">
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open ? (
                    <div className="admin-nav-section-links">
                      {section.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) => (isActive ? 'active' : '')}
                        >
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </nav>
          <div className="admin-sidebar-footer">
            <p className="admin-sidebar-email">{session?.user?.email || (configured ? '' : 'local preview')}</p>
            <Link to="/" className="admin-sidebar-link">
              View storefront
            </Link>
            {configured ? (
              <button type="button" className="admin-sidebar-link admin-sidebar-signout" onClick={logout}>
                Sign out
              </button>
            ) : null}
          </div>
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </AdminToastProvider>
  )
}
