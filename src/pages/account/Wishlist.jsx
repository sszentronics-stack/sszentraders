import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useWishlist } from '../../context/WishlistContext'
import { useProducts } from '../../hooks/useCatalog'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { formatPKR, salePercent } from '../../data/products'

export default function Wishlist() {
  const configured = isSupabaseConfigured()
  const { items, productIds, toggle, loading } = useWishlist()
  const { products } = useProducts()

  // Server mode already returns rich items; fallback mode only stores ids,
  // so cross-reference the already-loaded catalog list — same
  // "derive everything in memory" approach as useCatalog.js.
  const displayItems = configured
    ? items.map((item) => ({
        id: item.productId,
        slug: item.slug,
        name: item.name,
        price: item.price ?? 0,
        compareAt: item.compareAt ?? 0,
        image: item.image,
      }))
    : products
        .filter((p) => productIds.includes(p.id))
        .map((p) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, compareAt: p.compareAt, image: p.images[0] }))

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6" aria-busy="true" aria-label="Loading wishlist">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square bg-meta" />
            <div className="mt-3 h-4 bg-meta w-3/4" />
          </div>
        ))}
      </div>
    )
  }

  if (displayItems.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-medium font-display mb-3">Your wishlist is empty</h2>
        <p className="text-ink-soft max-w-md mx-auto mb-6">Tap the heart on any product to save it here.</p>
        <Link to="/shop" className="btn-lavender inline-block w-auto px-8">
          Browse products
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-medium font-display mb-6">My Wishlist</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {displayItems.map((item) => {
          const off = salePercent(item)
          return (
            <article key={item.id} className="product-card relative">
              <button
                type="button"
                aria-label="Remove from wishlist"
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white/90 grid place-items-center shadow"
                onClick={() => toggle({ id: item.id })}
              >
                <Heart size={16} fill="#c31818" color="#c31818" />
              </button>
              <Link to={`/products/${item.slug}`} className="block">
                <div className="thumb">
                  <img src={item.image} alt={item.name} />
                </div>
                <h3 className="mt-3 text-[15px] font-normal leading-snug px-2">{item.name}</h3>
                <p className="mt-2 text-[15px]">
                  {item.compareAt > item.price && <span className="price-compare">{formatPKR(item.compareAt)}</span>}
                  <span className={off ? 'price-sale' : 'font-medium'}>{formatPKR(item.price)}</span>
                </p>
              </Link>
            </article>
          )
        })}
      </div>
    </div>
  )
}
