import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSeo } from '../../hooks/useSeo'
import { loadLocalProfile } from '../../lib/localAccount'

const NAV = [
  { to: '/account', label: 'Profile', end: true },
  { to: '/account/addresses', label: 'Addresses' },
  { to: '/account/orders', label: 'Orders' },
  { to: '/account/returns', label: 'Returns' },
  { to: '/account/loyalty', label: 'Loyalty Points' },
  { to: '/account/wishlist', label: 'Wishlist' },
  { to: '/account/preferences', label: 'Preferences' },
]

export default function AccountLayout() {
  const { profile, user, logout, configured } = useAuth()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1)
    window.addEventListener('sszentronics-account', refresh)
    return () => window.removeEventListener('sszentronics-account', refresh)
  }, [])
  const local = configured ? null : loadLocalProfile()
  void revision
  const displayName = profile?.firstName || local?.firstName || user?.email

  useSeo({ title: 'My Account | SSzentronics', noindex: true })

  return (
    <div className="container py-4 py-lg-5">
      <div className="row g-4">
        <aside className="col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <p className="text-uppercase small text-secondary mb-1">SSzentronics</p>
              <h1 className="h3 mb-1">My account</h1>
              <p className="text-secondary mb-4">{displayName ? `Welcome back, ${displayName}.` : 'Welcome back.'}</p>
              <nav className="d-flex flex-column" aria-label="Account">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `account-pill${isActive ? ' active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              {configured ? (
                <button type="button" className="btn btn-outline-dark w-100 mt-3" onClick={logout}>
                  Sign out
                </button>
              ) : (
                <p className="small text-secondary mt-3 mb-0">Profile and addresses are saved on this device.</p>
              )}
            </div>
          </div>
        </aside>
        <section className="col-lg-9">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4 p-lg-5">
              <Outlet />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
