import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import WatchAndShop from '../components/WatchAndShop'
import ReviewMarquee from '../components/ReviewMarquee'
import { useProducts } from '../hooks/useCatalog'
import { useSeo, useJsonLd } from '../hooks/useSeo'
import { useSiteContent } from '../lib/siteContent'

function BannerLink({ action, className, children }) {
  if (String(action.to).startsWith('https://')) {
    return <a className={className} href={action.to}>{children}</a>
  }
  return <Link className={className} to={action.to}>{children}</Link>
}

function Arrow() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M1 7h12M8 2l5 5-5 5" />
    </svg>
  )
}

export default function Home() {
  const { products, loading, error } = useProducts()
  const { slides, story, stories, brands, home, business } = useSiteContent()
  const [slide, setSlide] = useState(0)
  const [storyIndex, setStoryIndex] = useState(0)
  const storyRef = useRef(null)
  useSeo({
    title: business.name,
    description: `${business.name} sells authentic SADOER, Hero Cosmetics, and SOME BY MI skincare. Orders are confirmed on WhatsApp. Cash on delivery is available.`,
  })
  useJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: business.name,
    email: business.email,
    telephone: business.phone,
    url: typeof window !== 'undefined' ? window.location.origin : undefined,
  })

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const banner = document.querySelector('[data-ssz-banner]')
    if (!banner) return undefined
    let timer
    const start = () => {
      clearInterval(timer)
      timer = setInterval(() => setSlide((current) => (current + 1) % Math.max(slides.length, 1)), 5000)
    }
    const stop = () => clearInterval(timer)
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()))
    observer.observe(banner)
    return () => {
      stop()
      observer.disconnect()
    }
  }, [slides.length])

  function openStory(index) {
    setStoryIndex(index)
    requestAnimationFrame(() => {
      const dialog = storyRef.current
      dialog?.showModal()
      dialog?.querySelector('video')?.play()?.catch(() => undefined)
    })
  }

  useEffect(() => {
    const dialog = storyRef.current
    if (!dialog?.open) return undefined
    const video = dialog.querySelector('video')
    if (!video) return undefined
    video.play().catch(() => undefined)
    return () => video.pause()
  }, [storyIndex])

  function moveStory(step) {
    setStoryIndex((current) => (current + step + stories.length) % stories.length)
  }

  const activeStory = stories[storyIndex]
  const activeSlug = activeStory?.to?.startsWith('/products/') ? activeStory.to.replace('/products/', '').split('?')[0] : ''
  const activeProduct = products.find((product) => product.slug === activeSlug)

  return (
    <>
      {stories.length > 0 && (
      <nav className="ssz-stories" aria-label="Shop by category">
        {stories.map((item, index) => (
          <button key={`${item.label}-${index}`} type="button" className="ssz-story" onClick={() => openStory(index)}>
            <div className="ssz-story__circle">
              <img className="ssz-story__img" src={item.image} alt="" width="88" height="88" />
              <span className="ssz-story__ring" aria-hidden="true" />
            </div>
            {item.label}
          </button>
        ))}
      </nav>
      )}

      {stories.length > 0 && (
      <dialog
        className="ssz-story-view"
        ref={storyRef}
        aria-label={activeStory ? `${activeStory.label} story` : 'Story'}
        onClick={(event) => {
          if (event.target === storyRef.current) storyRef.current.close()
        }}
        onClose={() => storyRef.current?.querySelector('video')?.pause()}
      >
        {activeStory && (
          <div className="ssz-story-view__frame">
            {activeStory.mediaType === 'video' && activeStory.storyVideo ? (
              <video
                key={activeStory.storyVideo}
                className="ssz-story-view__photo"
                src={activeStory.storyVideo}
                poster={activeStory.image}
                muted
                playsInline
                autoPlay
                width="720"
                height="1280"
              />
            ) : (
              <img className="ssz-story-view__photo" src={activeStory.storyImage || activeStory.image} alt="" width="720" height="1280" />
            )}
            <div className="ssz-story-view__bars" aria-hidden="true">
              {stories.map((item, index) => (
                <span key={`${item.label}-${index}`} className={index < storyIndex ? 'is-seen' : index === storyIndex ? 'is-active' : ''} />
              ))}
            </div>
            <div className="ssz-story-view__top">
              <p className="ssz-story-view__name">{activeStory.label}</p>
              <button type="button" className="ssz-story-view__close" aria-label="Close story" onClick={() => storyRef.current?.close()}>
                <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
            <button type="button" className="ssz-story-view__hit" aria-label="Previous story" onClick={() => moveStory(-1)} />
            <button type="button" className="ssz-story-view__hit ssz-story-view__hit--next" aria-label="Next story" onClick={() => moveStory(1)} />
            <div className="ssz-story-view__cta">
              {activeProduct && <p>{activeProduct.name}</p>}
              <Link className="ssz-btn" to={activeStory.to || '/shop'} onClick={() => storyRef.current?.close()}>
                Get this product
              </Link>
            </div>
          </div>
        )}
      </dialog>
      )}

      {slides.length > 0 && (
      <section className="ssz-banner" data-ssz-banner aria-label="Featured">
        {slides.map((item, index) => {
          const action = item.actions[0] || { to: '/shop', label: 'Get this product' }
          return (
          <div key={`${item.heading}-${index}`} className={`ssz-banner__slide${index === slide % slides.length ? ' is-active' : ''}`}>
            <img className="ssz-banner__media" src={item.image} alt="" width="1024" height="415" />
            <div className="ssz-banner__content">
              {index === 0 ? <h1 className="ssz-banner__heading">{item.heading}</h1> : <h2 className="ssz-banner__heading">{item.heading}</h2>}
              <p className="ssz-banner__text">{item.text}</p>
              <div className="ssz-banner__actions">
                <BannerLink action={action} className="ssz-banner__btn">
                  {action.label || 'Get this product'}
                </BannerLink>
              </div>
            </div>
          </div>
          )
        })}
        <div className="ssz-banner__dots">
          {slides.map((item, index) => (
            <button
              key={`${item.heading}-${index}`}
              type="button"
              className={`ssz-banner__dot${index === slide % slides.length ? ' is-active' : ''}`}
              aria-label={`Show slide ${index + 1}`}
              onClick={() => setSlide(index)}
            />
          ))}
        </div>
      </section>
      )}

      <section className="ssz-section ssz-section--mist">
        <div className="ssz-container">
          <div className="ssz-section__head">
            <h2 className="ssz-reveal">{home.featuredHeading}</h2>
            <Link className="ssz-arrow-link ssz-reveal" to="/shop">{home.viewAllLabel} <Arrow /></Link>
          </div>
          {loading ? (
            <p>Loading products</p>
          ) : products.length === 0 ? (
            <p>{error ? 'We could not load products right now. Please try again shortly.' : 'No products to show yet.'}</p>
          ) : (
            <ul className="ssz-grid" style={{ '--cols': 3 }} data-ssz-cascade>
              {products.map((product) => (
                <li key={product.id} className="ssz-reveal">
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {brands.length > 0 && (
      <section className="ssz-section ssz-section--brands">
        <div className="ssz-container">
          <div className="ssz-section__head">
            <h2 className="ssz-reveal">{home.brandHeading}</h2>
          </div>
          <ul className="ssz-grid" style={{ '--cols': 3 }} data-ssz-cascade>
            {brands.map((brand, index) => (
              <li key={`${brand.label}-${index}`} className="ssz-reveal">
                <Link className="ssz-card" to={brand.to}>
                  <div className="ssz-card__media ssz-brand__media">
                    <img className="ssz-card__img ssz-brand__logo" src={brand.image} alt="" width="600" height="600" loading="lazy" />
                  </div>
                  <div className="ssz-card__info">
                    <h3 className="ssz-card__title">{brand.label}</h3>
                    <span className="ssz-arrow-link">Shop this brand <Arrow /></span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      )}

      <section className="ssz-section ssz-section--story">
        <div className="ssz-container ssz-split">
          <img src={story.image} alt={story.alt} width="1024" height="1024" loading="lazy" />
          <div>
            <h2 className="ssz-reveal">{story.heading}</h2>
            <p className="ssz-reveal">{story.text}</p>
            <Link className="ssz-arrow-link ssz-reveal" to={story.linkTo}>{story.linkLabel} <Arrow /></Link>
          </div>
        </div>
      </section>

      <WatchAndShop products={products} />
      <ReviewMarquee />
    </>
  )
}
