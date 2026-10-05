import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useProducts } from '../hooks/useCatalog'
import { suggestProducts } from '../lib/productSearch'
import { formatPKR } from '../data/products'
import Logo from './Logo'

const BRANDS = [
  { to: '/shop?brand=SADOER', label: 'SADOER' },
  { to: '/shop?brand=Hero%20Cosmetics', label: 'Hero Cosmetics' },
  { to: '/shop?brand=SOME%20BY%20MI', label: 'SOME BY MI' },
]

export default function Header() {
  const { count, setIsOpen } = useCart()
  const { isAuthenticated, configured } = useAuth()
  const { products } = useProducts()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()
  const accountTo = configured && !isAuthenticated ? '/login' : '/account'
  const suggestions = useMemo(() => suggestProducts(products, query, 5), [products, query])

  useEffect(() => {
    const header = document.querySelector('[data-ssz-header]')
    if (!header) return undefined
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      header.classList.toggle('is-hidden', y > lastY && y > header.offsetHeight + 40)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function goToShop(q) {
    setSearchOpen(false)
    setMenuOpen(false)
    setQuery('')
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop')
  }

  return (
    <>
      <header className="ssz-header" data-ssz-header>
        <div className="ssz-container ssz-header__inner">
          <button type="button" className="ssz-icon-btn ssz-menu-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <Logo />
          <nav className="ssz-nav" aria-label="Main">
            <NavLink className={({ isActive }) => `ssz-nav__item${isActive ? ' is-active' : ''}`} to="/"><span>Home</span></NavLink>
            <NavLink className={({ isActive }) => `ssz-nav__item${isActive ? ' is-active' : ''}`} to="/shop"><span>Shop</span></NavLink>
            <details className="ssz-menu">
              <summary className="ssz-nav__item"><span>Brands</span></summary>
              <ul className="ssz-menu__panel">
                {BRANDS.map((brand) => (
                  <li key={brand.to}><Link to={brand.to}>{brand.label}</Link></li>
                ))}
              </ul>
            </details>
            <NavLink className={({ isActive }) => `ssz-nav__item${isActive ? ' is-active' : ''}`} to="/gallery"><span>Gallery</span></NavLink>
            <NavLink className={({ isActive }) => `ssz-nav__item${isActive ? ' is-active' : ''}`} to="/about"><span>About us</span></NavLink>
            <NavLink className={({ isActive }) => `ssz-nav__item${isActive ? ' is-active' : ''}`} to="/contact"><span>Contact</span></NavLink>
          </nav>
          <div className="ssz-header__icons">
            <button type="button" className="ssz-icon-btn" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            </button>
            <Link className="ssz-icon-btn" to={accountTo} aria-label={isAuthenticated ? 'My account' : 'Account'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3" /><path d="M5 19a7 7 0 0 1 14 0" /></svg>
            </Link>
            <button type="button" className="ssz-icon-btn" aria-label="Cart" onClick={() => setIsOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
              {count > 0 && <span className="ssz-cart-count">{count}</span>}
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="ssz-search">
            <form className="ssz-container" onSubmit={(event) => { event.preventDefault(); goToShop(query.trim()) }}>
              <label className="visually-hidden" htmlFor="site-search">Search</label>
              <input id="site-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" autoFocus />
              <button type="submit" className="ssz-btn">Search</button>
            </form>
            {suggestions.length > 0 && (
              <ul className="ssz-container">
                {suggestions.map((product) => (
                  <li key={product.id}>
                    <button type="button" onClick={() => { setSearchOpen(false); setQuery(''); navigate(`/products/${product.slug}`) }}>
                      <img src={product.images[0]} alt="" width="40" height="40" />
                      <span>{product.name}</span>
                      <span>{formatPKR(product.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>
      <div className={`ssz-drawer${menuOpen ? ' is-open' : ''}`}>
        <div className="ssz-drawer__backdrop" onClick={() => setMenuOpen(false)} />
        <nav className="ssz-drawer__panel" aria-label="Mobile">
          <button type="button" className="ssz-icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 5l14 14M19 5 5 19" /></svg>
          </button>
          <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/shop" onClick={() => setMenuOpen(false)}>Shop</Link>
          {BRANDS.map((brand) => (
            <Link key={brand.to} to={brand.to} onClick={() => setMenuOpen(false)}>{brand.label}</Link>
          ))}
          <Link to="/gallery" onClick={() => setMenuOpen(false)}>Gallery</Link>
          <Link to="/about" onClick={() => setMenuOpen(false)}>About us</Link>
          <Link to="/contact" onClick={() => setMenuOpen(false)}>Contact</Link>
          <Link to={accountTo} onClick={() => setMenuOpen(false)}>{isAuthenticated ? 'My account' : 'Account'}</Link>
        </nav>
      </div>
    </>
  )
}
