import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/returns', label: 'Returns' },
  { to: '/account/wishlist', label: 'Wishlist' },
  { to: '/account/preferences', label: 'Preferences' },
]

export default function AccountLayout() {
  const { profile, user, logout } = useAuth()
  const displayName = profile?.firstName || user?.email

  return (
    <div className="container-aura py-12 md:py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-medium font-display">My Account</h1>
        {displayName && <p className="text-ink-soft mt-1">Welcome back, {displayName}.</p>}
      </div>

      <div className="account-shell">
        <nav className="account-nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={logout}
            className="text-left"
            style={{ padding: '14px 18px', fontSize: 13, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c31818', border: 0, background: 'none', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </nav>

        <div className="account-panel">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
