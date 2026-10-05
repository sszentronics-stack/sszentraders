import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProducts } from '../hooks/useCatalog'
import { bannerForProduct } from '../data/shopBanners'
import { formatPKR, salePercent } from '../data/products'
import {
  priceAfterInfluencer,
  quoteInfluencerCode,
  setAppliedInfluencerPromo,
  useAppliedInfluencerPromo,
} from '../lib/influencerCodes'

function framesFor(product) {
  const banner = bannerForProduct(product)
  const extras = (product.images || []).filter((src) => src && src !== banner.image)
  return [{ src: banner.image, label: banner.headline }, ...extras.map((src) => ({ src, label: product.name }))].filter(
    (frame) => frame.src,
  )
}

export default function BannerGallery({ heading = 'Banner gallery', intro }) {
  const { products, loading } = useProducts()
  const items = useMemo(() => products.filter((product) => bannerForProduct(product).image), [products])
  const [active, setActive] = useState(null)
  const [frame, setFrame] = useState(0)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [claimError, setClaimError] = useState('')
  const [claimNote, setClaimNote] = useState('')
  const applied = useAppliedInfluencerPromo()

  function claimCode(event) {
    event.preventDefault()
    const quote = quoteInfluencerCode(code, 0, phone)
    if (!quote.eligible) {
      setClaimNote('')
      setClaimError(quote.reasons[0] || 'This code cannot be applied.')
      return
    }
    setClaimError('')
    setAppliedInfluencerPromo({
      code: quote.couponCode,
      phone: phone.trim(),
      phoneKey: quote.phoneKey,
      influencerName: quote.promotionName,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
    })
    const offer = quote.discountType === 'percentage' ? `${quote.discountValue}% off` : `Rs.${Number(quote.discountValue).toLocaleString('en-US')} off your order`
    setClaimNote(`${quote.promotionName}'s code is on this number. ${offer}. It cannot be used again from this phone.`)
  }

  const product = active == null ? null : items[active]
  const frames = product ? framesFor(product) : []
  const banner = product ? bannerForProduct(product) : null
  const current = frames[frame]

  useEffect(() => {
    if (active == null) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setActive(null)
      if (event.key === 'ArrowRight') setFrame((index) => (index + 1) % frames.length)
      if (event.key === 'ArrowLeft') setFrame((index) => (index - 1 + frames.length) % frames.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, frames.length])

  function openAt(index) {
    setActive(index)
    setFrame(0)
  }

  return (
    <section className="ssz-section" aria-label="Banner gallery">
      <div className="ssz-container">
      <div className="ssz-section__head">
        <h1>{heading}</h1>
      </div>
      {intro && <p>{intro}</p>}

      <form onSubmit={claimCode} className="ssz-promo">
        <div>
          <h2>Influencer promo code</h2>
          <p>The discount applies to these banners. Each mobile number can use a code only once.</p>
          <div className="ssz-form">
            <label htmlFor="gallery-phone">Mobile number
              <input id="gallery-phone" placeholder="03XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>
            <label htmlFor="gallery-code">Promo code
              <input id="gallery-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
            </label>
            <button type="submit" className="ssz-btn">Apply discount</button>
          </div>
          {claimError && <p className="text-danger small mt-3 mb-0">{claimError}</p>}
          {claimNote && <p className="text-success small mt-3 mb-0">{claimNote}</p>}
          {applied && !claimNote && (
            <p className="text-success small mt-3 mb-0">
              {applied.code} is active for {applied.phone}. {applied.discountType === 'percentage' ? `${applied.discountValue}% off the prices below.` : `Rs.${Number(applied.discountValue).toLocaleString('en-US')} off at checkout.`}
            </p>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-center text-secondary">Loading banners...</p>
      ) : (
        <div className="row g-3">
          {items.map((item, index) => {
            const copy = bannerForProduct(item)
            const salePrice = priceAfterInfluencer(item.price, applied)
            const off = salePrice < item.price ? Math.round(((item.price - salePrice) / item.price) * 100) : salePercent(item)
            return (
              <div className="col-md-6 col-xl-4" key={item.id}>
                <button type="button" className="banner-tile" onClick={() => openAt(index)}>
                  <img src={copy.image} alt="" />
                  <span className="banner-tile-copy">
                    <span className="banner-tile-kicker">{copy.eyebrow}</span>
                    <span className="banner-tile-title">{copy.headline}</span>
                    <span className="banner-tile-price">
                      {salePrice < item.price && <span className="text-decoration-line-through me-1">{formatPKR(item.price)}</span>}
                      {formatPKR(salePrice)}
                      {off > 0 ? ` · ${off}% off` : ''}
                    </span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {product && current && (
        <div className="banner-lightbox" role="dialog" aria-modal="true" aria-label={banner.headline}>
          <button type="button" className="banner-lightbox-backdrop" aria-label="Close gallery" onClick={() => setActive(null)} />
          <div className="banner-lightbox-panel">
            <img src={current.src} alt={current.label} />
            <div className="banner-lightbox-meta">
              <div>
                <p className="banner-tile-kicker mb-1">{banner.eyebrow}</p>
                <h3 className="h4 mb-1">{banner.headline}</h3>
                <p className="mb-0 text-secondary">{frame + 1} / {frames.length}</p>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline-dark" onClick={() => setFrame((index) => (index - 1 + frames.length) % frames.length)}>
                  Previous
                </button>
                <button type="button" className="btn btn-outline-dark" onClick={() => setFrame((index) => (index + 1) % frames.length)}>
                  Next
                </button>
                <Link className="btn btn-dark" to={`/products/${product.slug}`} onClick={() => setActive(null)}>
                  {banner.cta}
                </Link>
                <button type="button" className="btn btn-outline-dark" onClick={() => setActive(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
