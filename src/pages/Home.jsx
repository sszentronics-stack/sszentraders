import { useEffect, useState } from 'react'
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

  return (
    <>
      <nav className="ssz-stories" aria-label="Shop by category">
        {stories.map((item) => (
          <Link key={item.label} className="ssz-story" to={item.to}>
            <div className="ssz-story__circle">
              <img className="ssz-story__img" src={item.image} alt="" width="88" height="88" />
              <svg className="ssz-story__ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" /></svg>
            </div>
            {item.label}
          </Link>
        ))}
      </nav>

      <section className="ssz-banner" data-ssz-banner aria-label="Featured">
        {slides.map((item, index) => (
          <div key={`${item.heading}-${index}`} className={`ssz-banner__slide${index === slide % slides.length ? ' is-active' : ''}`}>
            <img className="ssz-banner__media" src={item.image} alt="" width="1024" height="415" />
            <div className="ssz-banner__content">
              {index === 0 ? <h1 className="ssz-banner__heading">{item.heading}</h1> : <h2 className="ssz-banner__heading">{item.heading}</h2>}
              <p className="ssz-banner__text">{item.text}</p>
              <div className="ssz-banner__actions">
                {item.actions.map((action) => (
                  <BannerLink key={action.label} action={action} className={`ssz-banner__btn${action.ghost ? ' ssz-banner__btn--ghost' : ''}`}>
                    {action.label}
                  </BannerLink>
                ))}
              </div>
            </div>
          </div>
        ))}
        <div className="ssz-banner__dots">
          {slides.map((item, index) => (
            <button
              key={item.heading}
              type="button"
              className={`ssz-banner__dot${index === slide % slides.length ? ' is-active' : ''}`}
              aria-label={`Show slide ${index + 1}`}
              onClick={() => setSlide(index)}
            />
          ))}
        </div>
      </section>

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

      <section className="ssz-section">
        <div className="ssz-container">
          <div className="ssz-section__head">
            <h2 className="ssz-reveal">{home.brandHeading}</h2>
          </div>
          <ul className="ssz-grid" style={{ '--cols': 3 }} data-ssz-cascade>
            {brands.map((brand) => (
              <li key={brand.label} className="ssz-reveal">
                <Link className="ssz-card" to={brand.to}>
                  <div className="ssz-card__media">
                    <img className="ssz-card__img" src={brand.image} alt="" width="600" height="600" loading="lazy" />
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

      <section className="ssz-section">
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
