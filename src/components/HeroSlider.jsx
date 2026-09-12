import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Photo-backed hero slides. Height stays on `.hero-slide` (420 / 520px). */
const SLIDES = [
  {
    id: 1,
    title: 'SADOER Collagen Mask',
    subtitle: 'Was Rs.199 · now Rs.129',
    to: '/products/sadoer-collagen-anti-aging-facial-mask',
    image: '/banners/sadoer-collagen-banner.png',
  },
  {
    id: 2,
    title: 'SOME BY MI Miracle Toner',
    subtitle: 'Was Rs.11,999 · now Rs.7,900',
    to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner',
    image: '/banners/some-by-mi-banner.png',
  },
  {
    id: 3,
    title: 'Hero Mighty Patch Invisible+',
    subtitle: 'Was Rs.5,500 · now Rs.4,400',
    to: '/products/hero-mighty-patch-invisible-plus',
    image: '/banners/mighty-patch-banner.png',
  },
]

export default function HeroSlider() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 7000)
    return () => clearInterval(id)
  }, [])

  const go = (dir) => setIndex((i) => (i + dir + SLIDES.length) % SLIDES.length)
  const slide = SLIDES[index]

  return (
    <section className="relative">
      <Link
        to={slide.to}
        className="hero-slide hero-photo cursor-pointer"
        aria-label={`${slide.title}. ${slide.subtitle}`}
      >
        <img src={slide.image} alt="" className="hero-photo-bg" />
        <div className="hero-photo-overlay" />
        <div className="hero-solid-copy">
          <p className="hero-solid-eyebrow">SS Zen Traders</p>
          <h1 className="hero-solid-title">{slide.title}</h1>
          <p className="hero-solid-sub">{slide.subtitle}</p>
          <span className="hero-solid-cta">Shop now</span>
        </div>
      </Link>

      <button
        type="button"
        className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-white/90"
        aria-label="Previous slide"
        onClick={(e) => {
          e.preventDefault()
          go(-1)
        }}
      >
        <ChevronLeft size={32} />
      </button>
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-white/90"
        aria-label="Next slide"
        onClick={(e) => {
          e.preventDefault()
          go(1)
        }}
      >
        <ChevronRight size={32} />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            className={`h-2 w-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/40'}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </section>
  )
}
