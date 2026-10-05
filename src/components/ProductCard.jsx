import { Link } from 'react-router-dom'
import { formatPKR } from '../data/products'
import { priceAfterInfluencer, useAppliedInfluencerPromo } from '../lib/influencerCodes'
import { useWishlist } from '../context/WishlistContext'

export default function ProductCard({ product }) {
  const applied = useAppliedInfluencerPromo()
  const salePrice = priceAfterInfluencer(product.price, applied)
  const compare = product.compareAt > product.price ? product.compareAt : product.price > salePrice ? product.price : 0
  const onSale = compare > salePrice
  const { isWishlisted, toggle } = useWishlist()
  const wishlisted = isWishlisted(product.id)
  const hover = product.images?.[1]
  const soldOut = product.availability === 'out_of_stock'

  return (
    <article className="ssz-card-wrap">
      <button
        type="button"
        className="ssz-card__wish"
        aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        aria-pressed={wishlisted}
        onClick={() => toggle(product)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill={wishlisted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z" /></svg>
      </button>
      <Link to={`/products/${product.slug}`} className="ssz-card">
        <div className="ssz-card__media">
          <img className="ssz-card__img" src={product.images[0]} alt={product.name} width="600" height="600" style={soldOut ? { opacity: 0.5 } : undefined} />
          {hover && <img className="ssz-card__img ssz-card__img--hover" src={hover} alt="" width="600" height="600" />}
          {soldOut ? <span className="ssz-badge ssz-card__badge">Sold out</span> : onSale && <span className="ssz-badge ssz-card__badge">Sale</span>}
        </div>
        <div className="ssz-card__info">
          <h3 className="ssz-card__title">{product.name}</h3>
          <div className="ssz-price">
            {onSale && <s>{formatPKR(compare)}</s>}
            {formatPKR(salePrice)}
          </div>
        </div>
      </Link>
    </article>
  )
}
