import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const SLIDES = [
  {
    id: 1,
    banner: '/banners/some-by-mi-banner.png',
    alt: 'SOME BY MI 30 Days Miracle Toner — was Rs.11,999 now Rs.7,900',
    to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner',
    theme: 'light',
    objectPosition: 'center right',
  },
  {
    id: 2,
    banner: '/banners/mighty-patch-banner.png',
    alt: 'Hero Mighty Patch Invisible+ — was Rs.5,500 now Rs.4,400',
    to: '/products/hero-mighty-patch-invisible-plus',
    theme: 'dark',
    objectPosition: 'center',
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
  const isDark = slide.theme === 'dark'

  return (
    <section className="relative">
      <Link
        to={slide.to}
        className={`hero-slide hero-photo ${isDark ? 'hero-photo-dark' : ''} cursor-pointer`}
        aria-label={slide.alt}
      >
        <img
          src={slide.banner}
          alt=""
          className="hero-photo-img"
        />
      </Link>

      <button
        type="button"
        className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 ${isDark ? 'text-white/90' : 'text-ink'}`}
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
        className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 ${isDark ? 'text-white/90' : 'text-ink'}`}
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
            onClick={() => setIndex(i)}
            className={`h-2.5 w-2.5 rounded-full ${
              i === index ? (isDark ? 'bg-white' : 'bg-ink') : isDark ? 'bg-white/40' : 'bg-ink/30'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
