import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Solid-color hero slides (no banner images). */
const SLIDES = [
  {
    id: 1,
    title: 'SADOER Collagen Mask',
    subtitle: 'Was Rs.199 · now Rs.129',
    to: '/products/sadoer-collagen-anti-aging-facial-mask',
    bg: '#c98a7d',
    color: '#ffffff',
  },
  {
    id: 2,
    title: 'SOME BY MI Miracle Toner',
    subtitle: 'Was Rs.11,999 · now Rs.7,900',
    to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner',
    bg: '#7a5b53',
    color: '#ffffff',
  },
  {
    id: 3,
    title: 'Hero Mighty Patch Invisible+',
    subtitle: 'Was Rs.5,500 · now Rs.4,400',
    to: '/products/hero-mighty-patch-invisible-plus',
    bg: '#222222',
    color: '#ffffff',
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
        className="hero-slide hero-solid cursor-pointer"
        style={{ background: slide.bg, color: slide.color }}
        aria-label={`${slide.title}. ${slide.subtitle}`}
      >
        <div className="hero-solid-copy">
          <p className="hero-solid-eyebrow">Aura Beauty Care</p>
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
