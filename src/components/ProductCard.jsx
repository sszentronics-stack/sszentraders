import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { formatPKR, salePercent } from '../data/products'
import { useWishlist } from '../context/WishlistContext'

const BADGE_CLASS = {
  sale: 'badge badge-sale',
  new: 'badge badge-new',
  bestseller: 'badge badge-best',
}

export default function ProductCard({ product }) {
  const off = salePercent(product)
  const badgeLabel = product.badge === 'bestseller' ? 'Bestseller' : product.badge === 'new' ? 'New' : 'Sale'
  const { isWishlisted, toggle } = useWishlist()
  const wishlisted = isWishlisted(product.id)

  return (
    <article className="product-card relative">
      <button
        type="button"
        aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        aria-pressed={wishlisted}
        className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white/90 grid place-items-center shadow"
        onClick={(e) => {
          e.preventDefault()
          toggle(product)
        }}
      >
        <Heart size={16} fill={wishlisted ? '#c31818' : 'none'} color={wishlisted ? '#c31818' : '#102b26'} />
      </button>
      <Link to={`/products/${product.slug}`} className="block">
        <div className="thumb">
          {product.badge && <span className={BADGE_CLASS[product.badge] || BADGE_CLASS.sale}>{badgeLabel}</span>}
          <img src={product.images[0]} alt={product.name} />
        </div>
        <h3 className="mt-3 text-[15px] font-normal leading-snug px-2">{product.name}</h3>
        <p className="mt-2 text-[15px]">
          {product.compareAt > product.price && (
            <span className="price-compare">{formatPKR(product.compareAt)}</span>
          )}
          <span className={off ? 'price-sale' : 'font-medium'}>{formatPKR(product.price)}</span>
          {off > 0 && <span className="price-sale ml-1.5 text-sm">{off}% off</span>}
        </p>
      </Link>
    </article>
  )
}
