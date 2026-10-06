import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { buildWhatsAppOrder, formatPKR, salePercent } from '../data/products'
import { orderCustomer, useSiteContent } from '../lib/siteContent'
import { priceAfterInfluencer, useAppliedInfluencerPromo } from '../lib/influencerCodes'
import { useProduct } from '../hooks/useCatalog'
import { useRecentlyViewed, useRecordRecentlyViewed } from '../hooks/useRecentlyViewed'
import { useSeo, useJsonLd } from '../hooks/useSeo'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { knownCustomer } from '../lib/customerDetails'
import { useWishlist } from '../context/WishlistContext'
import { useToast } from '../context/ToastContext'
import Disclaimer from '../components/Disclaimer'
import ProductCard from '../components/ProductCard'
import TrustBar from '../components/TrustBar'
import ReviewsSection from '../components/ReviewsSection'
import { ChevronLeft, ChevronRight, Heart, Share2 } from 'lucide-react'

export default function Product() {
  const { slug } = useParams()
  const { product, others, loading, notFound } = useProduct(slug)
  const { addItem, items } = useCart()
  const { profile, customer, user } = useAuth()
  const known = knownCustomer({ profile, customer, user })
  const { isWishlisted, toggle: toggleWishlist } = useWishlist()
  const toast = useToast()
  const [active, setActive] = useState(0)
  const [qty, setQty] = useState(1)
  const [open, setOpen] = useState('description')

  const [touchX, setTouchX] = useState(null)
  const [zoom, setZoom] = useState(false)
  const zoomRef = useRef(null)

  useEffect(() => {
    setActive(0)
    setZoom(false)
  }, [slug])

  useEffect(() => {
    if (zoom) zoomRef.current?.showModal()
  }, [zoom])

  useRecordRecentlyViewed(product?.id)
  const { items: recentlyViewed } = useRecentlyViewed(product?.id)
  const appliedPromo = useAppliedInfluencerPromo()
  const content = useSiteContent()

  useSeo({
    title: product ? `${product.name} | ${content.business.name}` : `Product | ${content.business.name}`,
    description: product ? (product.tagline || product.description)?.slice(0, 160) : undefined,
    image: product?.images?.[0],
  })
  useJsonLd(
    product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          image: product.images,
          description: product.tagline || product.description,
          brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
          offers: {
            '@type': 'Offer',
            priceCurrency: 'PKR',
            price: product.price,
            availability: 'https://schema.org/InStock',
            url: typeof window !== 'undefined' ? window.location.href : undefined,
          },
        }
      : undefined,
  )

  const sameCategory = product && product.category ? others.filter((p) => p.category === product.category) : []
  const related = sameCategory.length > 0 ? sameCategory : others

  if (loading) {
    return (
      <div className="container-aura py-8 md:py-12" aria-busy="true" aria-label="Loading product">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 animate-pulse">
          <div className="aspect-square bg-meta" />
          <div className="space-y-3">
            <div className="h-4 bg-meta w-1/3" />
            <div className="h-8 bg-meta w-3/4" />
            <div className="h-4 bg-meta w-1/2" />
            <div className="h-10 bg-meta w-1/3 mt-6" />
          </div>
        </div>
      </div>
    )
  }

  if (notFound) return <Navigate to="/shop" replace />

  const salePrice = priceAfterInfluencer(product.price, appliedPromo)
  const off = salePrice < product.price ? Math.round(((product.price - salePrice) / product.price) * 100) : salePercent(product)
  const last = product.images.length - 1
  const showPrev = () => setActive((i) => (i === 0 ? last : i - 1))
  const showNext = () => setActive((i) => (i === last ? 0 : i + 1))

  const thumbs = product.images.map((src, i) => (
    <button
      key={src}
      type="button"
      onClick={() => setActive(i)}
      className={`border ${i === active ? 'border-ink' : 'border-transparent'} bg-meta shrink-0`}
      aria-label={`View image ${i + 1}`}
    >
      <img src={src} alt="" className="w-16 h-16 object-contain" />
    </button>
  ))

  return (
    <div className="ssz-section">
      <div className="ssz-container">
      <nav className="text-sm text-ink-soft mb-6">
        <Link to="/">Home</Link>
        <span className="mx-2">/</span>
        <Link to="/shop">Shop</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="ssz-product">
        <div className="ssz-product__media">
          <div className="ssz-product__frame">
            <div className="ssz-product__thumbs">
              {thumbs}
            </div>
            <div
              className="ssz-product__stage"
              onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (touchX == null) return
                const dx = e.changedTouches[0].clientX - touchX
                if (dx > 40) showPrev()
                if (dx < -40) showNext()
                setTouchX(null)
              }}
            >
              {product.badge === 'bestseller' && <span className="badge badge-best">Bestseller</span>}
              {product.badge === 'sale' && <span className="badge badge-sale">Sale</span>}
              {product.badge === 'new' && <span className="badge badge-new">New</span>}
              <img
                src={product.images[active]}
                alt=""
                className="ssz-product__photo"
                width="800"
                height="800"
              />
              <button type="button" className="ssz-product__zoom" aria-label={`Zoom ${product.name}`} onClick={() => setZoom(true)} />
              {product.images.length > 1 && (
                <>
                  <button
                    type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 text-ink grid place-items-center shadow sm:hidden"
                    aria-label="Previous image"
                    onClick={showPrev}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 text-ink grid place-items-center shadow sm:hidden"
                    aria-label="Next image"
                    onClick={showNext}
                  >
                    <ChevronRight size={20} />
                  </button>
                  <p className="absolute bottom-2 right-3 z-10 text-xs bg-white/90 px-2 py-0.5 rounded sm:hidden">
                    {active + 1} / {product.images.length}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex sm:hidden gap-2 overflow-x-auto mt-3 pb-1 -mx-1 px-1">
            {thumbs}
          </div>
        </div>

        <div className="ssz-product__details">
          <p>{product.brand}</p>
          <h1>{product.name}</h1>
          <p>{product.tagline}</p>

          <p className="ssz-price">
            {(product.compareAt > salePrice || product.price > salePrice) && (
              <s>{formatPKR(product.compareAt > product.price ? product.compareAt : product.price)}</s>
            )}
            {formatPKR(salePrice)}
            {off > 0 && <span className="ssz-badge" style={{ marginLeft: 8 }}>Sale</span>}
          </p>

          {product.availability === 'out_of_stock' && (
            <p className="mt-3 text-sm font-medium" style={{ color: '#c31818' }}>Currently out of stock</p>
          )}
          {product.availability === 'low_stock' && (
            <p className="mt-3 text-sm" style={{ color: '#c98a7d' }}>Only a few left in stock</p>
          )}

          <ul className="mt-5 space-y-1.5 text-sm">
            {product.highlights.map((h) => (
              <li key={h}>• {h}</li>
            ))}
          </ul>

          <div className="mt-6">
            <p className="text-sm mb-2">Quantity</p>
            <div className="ssz-qty">
              <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} disabled={product.availability === 'out_of_stock'}>
                −
              </button>
              <input readOnly value={qty} />
              <button type="button" onClick={() => setQty((n) => n + 1)} disabled={product.availability === 'out_of_stock'}>
                +
              </button>
            </div>
          </div>

          <div className="ssz-actions">
            <button
              type="button"
              className="ssz-btn ssz-btn--outline"
              onClick={() => addItem(product, qty)}
              disabled={product.availability === 'out_of_stock'}
            >
              {product.availability === 'out_of_stock' ? 'Sold out' : 'Add to cart'}
            </button>
            <button
              type="button"
              aria-label={isWishlisted(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
              aria-pressed={isWishlisted(product.id)}
              className="w-12 shrink-0 border border-line grid place-items-center"
              onClick={() => toggleWishlist(product)}
            >
              <Heart size={18} fill={isWishlisted(product.id) ? '#9a3b32' : 'none'} color={isWishlisted(product.id) ? '#9a3b32' : '#1c1c1c'} />
            </button>
          </div>
          <div className="mt-3">
            <a
              className="ssz-btn"
              href={buildWhatsAppOrder(
                items.length ? items : [{ name: product.name, price: salePrice, qty }],
                orderCustomer(content, {
                  name: known.name,
                  phone: known.phone,
                  city: known.city,
                  address: [known.addressLine1, known.addressLine2].filter(Boolean).join(', '),
                }),
              )}
              target="_blank"
              rel="noreferrer"
            >
              {items.length ? 'Order on WhatsApp' : 'Buy now'}
            </a>
          </div>

          <div className="mt-6">
            <TrustBar />
            <p className="text-sm text-ink-soft mt-3">
              Payment options: COD, JazzCash, EasyPaisa &amp; bank transfer.
            </p>
          </div>

          <button
            type="button"
            className="mt-4 text-sm flex items-center gap-2"
            onClick={async () => {
              const shareData = { title: product.name, url: window.location.href }
              if (navigator.share) {
                try {
                  await navigator.share(shareData)
                } catch {
                  // User cancelled the native share sheet — not an error.
                }
                return
              }
              try {
                await navigator.clipboard.writeText(shareData.url)
                toast.success('Link copied to clipboard')
              } catch {
                toast.error('Could not copy the link. Please copy it from the address bar.')
              }
            }}
          >
            <Share2 size={15} /> Share
          </button>
        </div>
      </div>

      <dialog
        className="ssz-dialog ssz-zoom"
        ref={zoomRef}
        aria-label={product.name}
        onClick={(event) => {
          const rect = zoomRef.current?.getBoundingClientRect()
          if (!rect) return
          const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
          if (!inside) zoomRef.current.close()
        }}
        onClose={() => setZoom(false)}
      >
        <button type="button" className="ssz-icon-btn ssz-dialog__close" aria-label="Close" onClick={() => zoomRef.current?.close()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 5l14 14M19 5 5 19" /></svg>
        </button>
        <img className="ssz-zoom__img" src={product.images[active]} alt={product.name} width="1200" height="1200" />
      </dialog>

      <div className="mt-12 max-w-3xl">
        <Accordion id="description" title="Description" open={open} setOpen={setOpen}>
          <p className="whitespace-pre-line mb-4">{product.description}</p>
          <ul className="list-disc pl-5 space-y-1">
            {product.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Accordion>
        <Accordion id="directions" title="Directions" open={open} setOpen={setOpen}>
          <ol className="list-decimal pl-5 space-y-1">
            {product.howToUse.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Accordion>
        <Accordion id="cautions" title="Cautions" open={open} setOpen={setOpen}>
          <p>Discontinue if irritation occurs. Avoid contact with eyes. For external use only. Read the label before use.</p>
        </Accordion>
        <Accordion id="ingredients" title="Ingredients" open={open} setOpen={setOpen}>
          <p>{product.ingredients}</p>
        </Accordion>
        <Accordion id="details" title="Product details" open={open} setOpen={setOpen}>
          <table className="w-full text-sm">
            <tbody>
              {product.details.map(([k, v]) => (
                <tr key={k} className="border-b border-[#eee]">
                  <td className="py-2 pr-4 font-medium w-40">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-4 font-medium">SKU</td>
                <td>{product.sku}</td>
              </tr>
            </tbody>
          </table>
        </Accordion>
        <Accordion id="disclaimer" title="Disclaimer" open={open} setOpen={setOpen}>
          <Disclaimer />
        </Accordion>
      </div>

      <ReviewsSection productId={product.id} />

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-medium mb-8">
            {sameCategory.length > 0 ? `More in ${product.category}` : 'Recommended products'}
          </h2>
          <ul className="ssz-grid">
            {related.slice(0, 4).map((p) => (
              <li key={p.id}><ProductCard product={p} /></li>
            ))}
          </ul>
        </section>
      )}

      {recentlyViewed.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-medium mb-8">Recently viewed</h2>
          <ul className="ssz-grid">
            {recentlyViewed.slice(0, 4).map((p) => (
              <li key={p.id}><ProductCard product={p} /></li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  )
}

function Accordion({ id, title, open, setOpen, children }) {
  const isOpen = open === id
  return (
    <div>
      <button type="button" className="accordion-btn" onClick={() => setOpen(isOpen ? '' : id)}>
        {title}
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="py-4 text-[15px] leading-relaxed">{children}</div>}
    </div>
  )
}
