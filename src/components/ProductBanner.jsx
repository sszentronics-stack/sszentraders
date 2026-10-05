import { Link } from 'react-router-dom'
import { formatPKR, salePercent } from '../data/products'
import { bannerForProduct } from '../data/shopBanners'
import { priceAfterInfluencer, useAppliedInfluencerPromo } from '../lib/influencerCodes'

export default function ProductBanner({ product, flip = false }) {
  const banner = bannerForProduct(product)
  const applied = useAppliedInfluencerPromo()
  const salePrice = priceAfterInfluencer(product.price, applied)
  const off = salePrice < product.price ? Math.round(((product.price - salePrice) / product.price) * 100) : salePercent(product)

  return (
    <article className="card border-0 shadow-sm mb-4 overflow-hidden shop-banner">
      <div className={`row g-0 ${flip ? 'flex-md-row-reverse' : ''}`}>
        <div className="col-md-6">
          <img src={banner.image || product.images?.[0]} alt="" className="shop-banner-img" />
        </div>
        <div className="col-md-6 d-flex">
          <div className="card-body p-4 p-lg-5 d-flex flex-column">
            <p className="text-uppercase small text-secondary mb-2 shop-banner-kicker">{banner.eyebrow}</p>
            <h2 className="h1 mb-3 shop-banner-title">{banner.headline}</h2>
            <p className="text-secondary mb-4">{banner.body}</p>
            <p className="mb-4">
              {(product.compareAt > salePrice || product.price > salePrice) && (
                <span className="text-decoration-line-through text-secondary me-2">{formatPKR(product.compareAt > product.price ? product.compareAt : product.price)}</span>
              )}
              <span className="fs-4 fw-semibold">{formatPKR(salePrice)}</span>
              {off > 0 && <span className="badge text-bg-dark ms-2">{off}% off</span>}
            </p>
            <Link to={`/products/${product.slug}`} className="btn btn-dark align-self-start px-4">
              {banner.cta}
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
