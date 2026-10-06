import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import { useProducts } from '../hooks/useCatalog'
import { useSeo } from '../hooks/useSeo'
import { deriveFacets, filterProducts, sortProducts } from '../lib/productSearch'

const SORT_LABELS = {
  relevance: 'Relevance',
  newest: 'Newest',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
  popular: 'Popular',
}

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const { products, loading, error } = useProducts()
  const [filtersOpen, setFiltersOpen] = useState(false)

  useSeo({
    title: 'Shop | SS Zen Traders',
    description: 'Shop SADOER, Hero Cosmetics, and SOME BY MI at SS Zen Traders.',
  })

  const q = params.get('q') || ''
  const category = params.get('category') || ''
  const brand = params.get('brand') || ''
  const sort = params.get('sort') || 'relevance'
  const minPrice = params.get('minPrice') ? Number(params.get('minPrice')) : undefined
  const maxPrice = params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined
  const availability = params.get('availability') === 'in-stock' ? 'in-stock' : 'all'

  const facets = useMemo(() => deriveFacets(products), [products])

  const filtered = useMemo(
    () => filterProducts(products, { q, category, brand, minPrice, maxPrice, availability }),
    [products, q, category, brand, minPrice, maxPrice, availability],
  )
  const sorted = useMemo(() => sortProducts(filtered, sort), [filtered, sort])

  const hasActiveFilters = Boolean(category || brand || minPrice != null || maxPrice != null || availability === 'in-stock')

  function updateParam(key, value) {
    const next = new URLSearchParams(params)
    if (value === '' || value == null) next.delete(key)
    else next.set(key, String(value))
    setParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    setParams(next, { replace: true })
  }

  // Keep the filter drawer's local price inputs from fighting the URL on every keystroke.
  const [priceInputs, setPriceInputs] = useState({ min: minPrice ?? '', max: maxPrice ?? '' })
  useEffect(() => {
    setPriceInputs({ min: minPrice ?? '', max: maxPrice ?? '' })
  }, [minPrice, maxPrice])

  return (
    <div className="ssz-section">
      <div className="ssz-container">
      <h1>Shop</h1>
      {!loading && (
        <p className="text-ink-soft mb-6">
          {sorted.length} result{sorted.length === 1 ? '' : 's'}
          {q ? ` for "${q}"` : ''}
          {category ? ` in ${category}` : ''}
        </p>
      )}

      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-[#eee]">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium lg:hidden"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal size={16} />
          Filters{hasActiveFilters ? ' •' : ''}
        </button>
        <div className="hidden lg:flex items-center gap-2 text-sm">
          {hasActiveFilters && (
            <button type="button" className="underline text-ink-soft" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm ml-auto">
          <span className="text-ink-soft hidden sm:inline">Sort by</span>
          <select
            className="ssz-sort"
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value === 'relevance' ? '' : e.target.value)}
            className="border border-line bg-white px-2.5 py-2 text-sm"
            aria-label="Sort products"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="ssz-shop-layout">
        <FilterPanel
          className="hidden lg:block"
          facets={facets}
          category={category}
          brand={brand}
          availability={availability}
          priceInputs={priceInputs}
          setPriceInputs={setPriceInputs}
          onCategory={(v) => updateParam('category', v)}
          onBrand={(v) => updateParam('brand', v)}
          onAvailability={(v) => updateParam('availability', v === 'in-stock' ? 'in-stock' : '')}
          onApplyPrice={() => {
            updateParam('minPrice', priceInputs.min)
            updateParam('maxPrice', priceInputs.max)
          }}
        />

        <div>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10" aria-busy="true" aria-label="Loading products">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-meta" />
                  <div className="mt-3 h-4 bg-meta w-3/4" />
                  <div className="mt-2 h-4 bg-meta w-1/3" />
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <NoResults error={error} hasActiveFilters={hasActiveFilters} categories={facets.categories} onClearFilters={clearFilters} />
          ) : (
            <ul className="ssz-grid">
              {sorted.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="drawer-overlay lg:hidden" onClick={() => setFiltersOpen(false)}>
          <aside
            className="absolute top-0 left-0 h-full w-[min(340px,88%)] bg-white p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium">Filters</h2>
              <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                <X />
              </button>
            </div>
            <FilterPanel
              facets={facets}
              category={category}
              brand={brand}
              availability={availability}
              priceInputs={priceInputs}
              setPriceInputs={setPriceInputs}
              onCategory={(v) => updateParam('category', v)}
              onBrand={(v) => updateParam('brand', v)}
              onAvailability={(v) => updateParam('availability', v === 'in-stock' ? 'in-stock' : '')}
              onApplyPrice={() => {
                updateParam('minPrice', priceInputs.min)
                updateParam('maxPrice', priceInputs.max)
                setFiltersOpen(false)
              }}
            />
            {hasActiveFilters && (
              <button type="button" className="btn-outline mt-6 w-full" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </aside>
        </div>
      )}
      </div>
    </div>
  )
}

function FilterPanel({ className = '', facets, category, brand, availability, priceInputs, setPriceInputs, onCategory, onBrand, onAvailability, onApplyPrice }) {
  return (
    <div className={`ssz-filters ${className}`}>
      <div className="mb-8">
        <p className="label-wide text-ink-soft mb-3">Category</p>
        <div className="space-y-2">
          <FilterOption label="All" active={!category} onClick={() => onCategory('')} />
          {facets.categories.map((c) => (
            <FilterOption key={c} label={c} active={category === c} onClick={() => onCategory(category === c ? '' : c)} />
          ))}
        </div>
      </div>

      {facets.brands.length > 1 && (
        <div className="mb-8">
          <p className="label-wide text-ink-soft mb-3">Brand</p>
          <div className="space-y-2">
            <FilterOption label="All" active={!brand} onClick={() => onBrand('')} />
            {facets.brands.map((b) => (
              <FilterOption key={b} label={b} active={brand === b} onClick={() => onBrand(brand === b ? '' : b)} />
            ))}
          </div>
        </div>
      )}

      <div className="mb-8">
        <p className="label-wide text-ink-soft mb-3">Price (Rs.)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Min"
            value={priceInputs.min}
            onChange={(e) => setPriceInputs((p) => ({ ...p, min: e.target.value }))}
            className="w-full border border-line px-2.5 py-2 text-sm bg-white"
            aria-label="Minimum price"
          />
          <span className="text-ink-soft">–</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Max"
            value={priceInputs.max}
            onChange={(e) => setPriceInputs((p) => ({ ...p, max: e.target.value }))}
            className="w-full border border-line px-2.5 py-2 text-sm bg-white"
            aria-label="Maximum price"
          />
        </div>
        <button type="button" className="btn-outline mt-3 w-full text-sm" onClick={onApplyPrice}>
          Apply
        </button>
      </div>

      <div>
        <p className="label-wide text-ink-soft mb-3">Availability</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={availability === 'in-stock'} onChange={(e) => onAvailability(e.target.checked ? 'in-stock' : '')} />
          In stock only
        </label>
      </div>
    </div>
  )
}

function FilterOption({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block text-sm ${active ? 'font-medium text-ink' : 'text-ink-soft'}`}
    >
      {label}
    </button>
  )
}

function NoResults({ error, hasActiveFilters, categories, onClearFilters }) {
  if (error) {
    return <p>We could not load products right now. Please try again shortly.</p>
  }
  return (
    <div>
      <p className="mb-4">No products match your search{hasActiveFilters ? ' and filters' : ''}.</p>
      {hasActiveFilters && (
        <button type="button" className="btn-outline inline-block w-auto px-6 mb-6" onClick={onClearFilters}>
          Clear filters
        </button>
      )}
      {categories.length > 0 && (
        <div>
          <p className="text-sm text-ink-soft mb-3">Try browsing a category instead:</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link key={c} to={`/shop?category=${encodeURIComponent(c)}`} className="badge badge-new">
                {c}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
