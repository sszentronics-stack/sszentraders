import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import { useProducts } from '../hooks/useCatalog'

export default function Shop() {
  const [params] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()
  const category = params.get('category') || ''
  const { products, loading, error } = useProducts()

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const hay = `${p.name} ${p.brand} ${p.category} ${p.type} ${p.tagline}`.toLowerCase()
      const matchesQ = !q || hay.includes(q)
      const matchesCat = !category || p.category === category
      return matchesQ && matchesCat
    })
  }, [products, q, category])

  return (
    <div className="container-aura py-10 md:py-14">
      <p className="text-sm text-ink-soft mb-2">
        <span>Home</span>
        <span className="mx-2">/</span>
        <span>Shop</span>
      </p>
      <h1 className="text-3xl md:text-4xl font-medium mb-2">Shop</h1>
      {!loading && (
        <p className="text-ink-soft mb-8">
          {filtered.length} result{filtered.length === 1 ? '' : 's'}
          {q ? ` for "${params.get('q')}"` : ''}
          {category ? ` in ${category}` : ''}
        </p>
      )}
      {loading ? (
        <div className="grid grid-cols-2 max-w-[900px] gap-x-6 gap-y-10" aria-busy="true" aria-label="Loading products">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-meta" />
              <div className="mt-3 h-4 bg-meta w-3/4" />
              <div className="mt-2 h-4 bg-meta w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p>
          {error
            ? 'We could not load products right now. Please try again shortly.'
            : 'No products match your search. Try SADOER, Mighty Patch, or SOME BY MI.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 max-w-[900px] gap-x-6 gap-y-10">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
