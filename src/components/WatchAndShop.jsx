import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPKR } from '../data/products'
import { priceAfterInfluencer, useAppliedInfluencerPromo } from '../lib/influencerCodes'
import { useCart } from '../context/CartContext'
import { useSiteContent } from '../lib/siteContent'

const VIDEOS = {
  'sadoer-collagen-anti-aging-facial-mask': '/videos/sadoer.mp4',
  'hero-mighty-patch-invisible-plus': '/videos/mighty-patch.mp4',
  'some-by-mi-aha-bha-pha-30-days-miracle-toner': '/videos/some-by-mi.mp4',
}

const CARD_ORDER = [
  'hero-mighty-patch-invisible-plus',
  'sadoer-collagen-anti-aging-facial-mask',
  'some-by-mi-aha-bha-pha-30-days-miracle-toner',
]

function Star() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M9 2 4 7l5 5" />
    </svg>
  )
}

export default function WatchAndShop({ products }) {
  const trackRef = useRef(null)
  const dialogRef = useRef(null)
  const { addItem } = useCart()
  const applied = useAppliedInfluencerPromo()
  const watch = useSiteContent().watch
  const [active, setActive] = useState(null)
  const [canScroll, setCanScroll] = useState(false)
  const cards = products
    .map((product) => ({
      product,
      video: watch.clips[product.slug] || VIDEOS[product.slug],
      poster: product.images?.[0],
      caption: product.tagline || product.subtitle || product.name,
    }))
    .filter((card) => card.video)
    .sort((a, b) => CARD_ORDER.indexOf(a.product.slug) - CARD_ORDER.indexOf(b.product.slug))

  useEffect(() => {
    const track = trackRef.current
    if (!track) return undefined
    const update = () => setCanScroll(track.scrollWidth > track.clientWidth + 8)
    update()
    const resize = new ResizeObserver(update)
    resize.observe(track)
    return () => resize.disconnect()
  }, [cards.length])

  useEffect(() => {
    const videos = trackRef.current?.querySelectorAll('video') ?? []
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target
        if (entry.isIntersecting) video.play().catch(() => undefined)
        else video.pause()
      })
    }, { threshold: 0.5 })
    videos.forEach((video) => observer.observe(video))
    return () => observer.disconnect()
  }, [cards.length])

  function scrollByCard(direction) {
    const track = trackRef.current
    const card = track?.querySelector('.ssz-sv__card')
    if (!track || !card) return
    track.scrollBy({ left: direction * (card.offsetWidth + 16) })
  }

  useEffect(() => {
    if (active) dialogRef.current?.showModal()
  }, [active])

  function openCard(card) {
    setActive(card)
  }

  if (cards.length === 0) return null

  return (
    <section className="ssz-section ssz-section--mist">
      <div className="ssz-container">
        <div className="ssz-section__head">
          <div>
            <h2 className="ssz-display ssz-reveal" style={{ fontSize: 28 }}>{watch.heading}</h2>
            <p className="ssz-reveal" style={{ margin: '8px 0 0' }}>{watch.lead}</p>
          </div>
          {canScroll && (
            <div className="ssz-sv__nav">
              <button type="button" className="ssz-sv__arrow" aria-label="Previous videos" onClick={() => scrollByCard(-1)}>
                <Star />
              </button>
              <button type="button" className="ssz-sv__arrow" aria-label="Next videos" onClick={() => scrollByCard(1)}>
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 2 5 5-5 5" /></svg>
              </button>
            </div>
          )}
        </div>
        <ul className="ssz-sv__track" ref={trackRef} data-ssz-cascade data-count={cards.length}>
          {cards.map((card) => {
            const price = priceAfterInfluencer(card.product.price, applied)
            return (
              <li className="ssz-sv__card ssz-reveal" key={card.product.id}>
                <button type="button" className="ssz-sv__video" onClick={() => openCard(card)}>
                  <video
                    src={card.video}
                    poster={card.poster}
                    muted
                    loop
                    playsInline
                    preload="auto"
                    width="360"
                    height="640"
                  />
                  <span className="ssz-sv__play" aria-hidden="true">
                    <svg viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l8-4.5-8-4.5z" /></svg>
                  </span>
                  <p className="ssz-sv__caption">{card.caption}</p>
                </button>
                <div className="ssz-sv__product">
                  <img className="ssz-sv__thumb" src={card.product.images[0]} alt="" width="72" height="72" />
                  <div>
                    <div className="ssz-sv__name">{card.product.name}</div>
                    <div className="ssz-sv__price">{formatPKR(price)}</div>
                  </div>
                </div>
                <button type="button" className="ssz-sv__add" onClick={() => addItem(card.product, 1)}>Add to cart</button>
              </li>
            )
          })}
        </ul>
      </div>
      <dialog
        className="ssz-dialog"
        ref={dialogRef}
        aria-label="Product"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current.close()
        }}
        onClose={() => setActive(null)}
      >
        {active && (
          <>
            <button type="button" className="ssz-icon-btn ssz-dialog__close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 5l14 14M19 5 5 19" /></svg>
            </button>
            <div className="ssz-dialog__body">
              <video className="ssz-dialog__media" src={active.video} poster={active.poster} controls muted playsInline autoPlay width="360" height="640" />
              <div>
                <h2>{active.product.name}</h2>
                <div className="ssz-price">{formatPKR(priceAfterInfluencer(active.product.price, applied))}</div>
                <p>{active.caption}</p>
                <button type="button" className="ssz-btn" onClick={() => addItem(active.product, 1)}>Add to cart</button>
                <p><Link className="ssz-link" to={`/products/${active.product.slug}`} onClick={() => dialogRef.current?.close()}>View product</Link></p>
              </div>
            </div>
          </>
        )}
      </dialog>
    </section>
  )
}
