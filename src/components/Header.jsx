import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import Logo from './Logo'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useProducts } from '../hooks/useCatalog'
import { suggestProducts } from '../lib/productSearch'
import { formatPKR } from '../data/products'

const NAV = [
  { to: '/shop', label: 'Shop' },
  { to: '/products/sadoer-collagen-anti-aging-facial-mask', label: 'SADOER Mask' },
  { to: '/products/hero-mighty-patch-invisible-plus', label: 'Mighty Patch' },
  { to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner', label: 'SOME BY MI' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export default function Header({ onSearch }) {
  const { count, setIsOpen } = useCart()
  const { isAuthenticated, configured } = useAuth()
  const { products } = useProducts()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()

  const suggestions = useMemo(() => suggestProducts(products, query, 5), [products, query])

  const goToShop = (q) => {
    setSearchOpen(false)
    setMenuOpen(false)
    setQuery('')
    if (onSearch) onSearch()
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop')
  }

  const submitSearch = (e) => {
    e.preventDefault()
    goToShop(query.trim())
  }

  return (
    <header className="header-bar">
      <div className="container-aura flex items-center justify-between gap-4 h-[92px]">
        <button
          type="button"
          className="lg:hidden text-ink"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={22} />
        </button>

        <Logo />

        <nav className="hidden lg:flex items-center gap-6 flex-1 justify-center">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4 text-ink">
          <button type="button" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <Search size={20} />
          </button>
          {configured && (
            <Link to={isAuthenticated ? '/account' : '/login'} aria-label={isAuthenticated ? 'My account' : 'Sign in'}>
              <User size={20} />
            </Link>
          )}
          <button
            type="button"
            className="relative"
            aria-label="Open cart"
            onClick={() => setIsOpen(true)}
          >
            <ShoppingBag size={20} />
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] rounded-full bg-rose text-white text-[11px] font-semibold grid place-items-center px-1">
              {count}
            </span>
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="drawer-overlay" onClick={() => setSearchOpen(false)}>
          <div
            className="absolute top-0 left-0 right-0 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={submitSearch} className="container-aura flex items-center gap-3">
              <Search size={18} className="text-ink-soft" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What are you looking for?"
                className="flex-1 border-0 outline-none text-lg py-2 text-ink"
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="search-suggestions"
              />
              <button type="submit" className="text-sm font-medium">
                Search
              </button>
              <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>
                <X size={18} />
              </button>
            </form>
            {suggestions.length > 0 && (
              <ul id="search-suggestions" className="container-aura mt-2 border-t border-[#eee] pt-2">
                {suggestions.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-meta"
                      onClick={() => {
                        setSearchOpen(false)
                        setMenuOpen(false)
                        setQuery('')
                        if (onSearch) onSearch()
                        navigate(`/products/${product.slug}`)
                      }}
                    >
                      <img src={product.images[0]} alt="" className="w-10 h-10 object-contain bg-meta shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{product.name}</span>
                        <span className="block text-xs text-ink-soft">{product.brand}</span>
                      </span>
                      <span className="text-sm shrink-0">{formatPKR(product.price)}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className="w-full text-left py-2 text-sm underline text-ink-soft" onClick={() => goToShop(query.trim())}>
                    See all results for "{query.trim()}"
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="drawer-overlay lg:hidden" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute top-0 left-0 h-full w-[min(320px,88%)] bg-blush text-ink p-6 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <Logo compact />
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X />
              </button>
            </div>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="nav-link text-base"
              >
                {item.label}
              </Link>
            ))}
            {configured && (
              <Link
                to={isAuthenticated ? '/account' : '/login'}
                onClick={() => setMenuOpen(false)}
                className="nav-link text-base"
              >
                {isAuthenticated ? 'My Account' : 'Sign In'}
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
