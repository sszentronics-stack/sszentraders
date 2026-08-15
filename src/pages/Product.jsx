import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  buildWhatsAppProduct,
  formatPKR,
  getProductBySlug,
  products,
  salePercent,
} from '../data/products'
import { useCart } from '../context/CartContext'
import Disclaimer from '../components/Disclaimer'
import ProductCard from '../components/ProductCard'
import TrustBar from '../components/TrustBar'
import { ChevronLeft, ChevronRight, Share2, Star } from 'lucide-react'

export default function Product() {
  const { slug } = useParams()
  const product = getProductBySlug(slug)
  const { addItem } = useCart()
  const [active, setActive] = useState(0)
  const [qty, setQty] = useState(1)
  const [open, setOpen] = useState('description')

  const [touchX, setTouchX] = useState(null)

  useEffect(() => {
    setActive(0)
  }, [slug])

  if (!product) return <Navigate to="/shop" replace />

  const off = salePercent(product)
  const others = products.filter((p) => p.id !== product.id)
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
    <div className="container-aura py-8 md:py-12">
      <nav className="text-sm text-ink-soft mb-6">
        <Link to="/">Home</Link>
        <span className="mx-2">/</span>
        <Link to="/shop">Shop</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        <div className="min-w-0 w-full">
          <div className="flex gap-3 min-w-0 w-full items-start">
            <div className="hidden sm:flex flex-col gap-2 w-16 shrink-0 max-h-[min(70vw,520px)] overflow-y-auto">
              {thumbs}
            </div>
            <div
              className="relative flex-1 min-w-0 w-full overflow-hidden bg-meta aspect-square"
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
              <img
                src={product.images[active]}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-contain p-6 pointer-events-none"
              />
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

        <div className="min-w-0">
          <p className="text-sm uppercase tracking-wide text-ink-soft">{product.brand}</p>
          <h1 className="text-3xl md:text-4xl font-medium mt-1 leading-tight">{product.name}</h1>
          <p className="mt-2 text-ink-soft">{product.subtitle}</p>
          <div className="flex items-center gap-1 mt-3 text-sm">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={13} fill="#102b26" color="#102b26" />
            ))}
            <span className="ml-1">{product.rating}</span>
            <span className="text-ink-soft">({product.reviewCount} reviews)</span>
          </div>

          <p className="mt-5 text-xl">
            {product.compareAt > product.price && (
              <span className="price-compare">{formatPKR(product.compareAt)}</span>
            )}
            <span className={off ? 'price-sale text-2xl' : 'font-medium text-2xl'}>
              {formatPKR(product.price)}
            </span>
            {off > 0 && <span className="price-sale ml-2 text-base">{off}% off</span>}
          </p>

          <ul className="mt-5 space-y-1.5 text-sm">
            {product.highlights.map((h) => (
              <li key={h}>• {h}</li>
            ))}
          </ul>

          <div className="mt-6">
            <p className="text-sm mb-2">Quantity</p>
            <div className="qty">
              <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))}>
                −
              </button>
              <input readOnly value={qty} />
              <button type="button" onClick={() => setQty((n) => n + 1)}>
                +
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <button type="button" className="btn-lavender" onClick={() => addItem(product, qty)}>
              Add to bag
            </button>
            <a
              className="btn-outline block text-center"
              href={buildWhatsAppProduct(product, qty)}
              target="_blank"
              rel="noreferrer"
            >
              Buy it now on WhatsApp
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
            onClick={() => navigator.share?.({ title: product.name, url: window.location.href })}
          >
            <Share2 size={15} /> Share
          </button>
        </div>
      </div>

      <div className="mt-12 max-w-3xl">
        <Accordion
          id="description"
          title="Description"
          open={open}
          setOpen={setOpen}
        >
          <h3 className="font-medium mb-2">{product.name} — {product.tagline}</h3>
          <p className="whitespace-pre-line mb-4">{product.description}</p>
          <p className="font-medium mb-2">Key benefits</p>
          <ul className="list-disc pl-5 space-y-1 mb-4">
            {product.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="font-medium mb-2">How to use</p>
          <ol className="list-decimal pl-5 space-y-1">
            {product.howToUse.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
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

      {others.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-medium mb-8">Recommended products</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {others.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
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
