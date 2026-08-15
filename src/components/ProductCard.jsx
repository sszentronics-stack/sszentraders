import { Link } from 'react-router-dom'
import { formatPKR, salePercent } from '../data/products'

const BADGE_CLASS = {
  sale: 'badge badge-sale',
  new: 'badge badge-new',
  bestseller: 'badge badge-best',
}

export default function ProductCard({ product }) {
  const off = salePercent(product)
  const badgeLabel = product.badge === 'bestseller' ? 'Bestseller' : product.badge === 'new' ? 'New' : 'Sale'

  return (
    <article className="product-card">
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
