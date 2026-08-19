import { useState } from 'react'
import { Link } from 'react-router-dom'
import HeroSlider from '../components/HeroSlider'
import ProductCard from '../components/ProductCard'
import { useProducts } from '../hooks/useCatalog'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const CATEGORIES = [
  { label: 'Acne Care', to: '/shop?category=Acne+Care', image: '/products/mighty-patch/1.jpg' },
  { label: 'Toners', to: '/shop?category=Toners', image: '/products/some-by-mi/1.jpg' },
  { label: 'Masks', to: '/shop?category=Masks', image: '/products/sadoer-collagen/1.png' },
  { label: 'Anti-Aging', to: '/shop?q=collagen', image: '/products/sadoer-collagen/2.png' },
]

export default function Home() {
  const [tab, setTab] = useState('new')
  const { products, loading, error } = useProducts()
  const list = tab === 'best' ? [...products].sort((a, b) => Number(b.featured) - Number(a.featured)) : products

  return (
    <>
      <HeroSlider />

      <section className="container-aura py-12 md:py-16">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div className="section-tabs">
            <button type="button" className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
              New arrivals
            </button>
            <button type="button" className={tab === 'best' ? 'active' : ''} onClick={() => setTab('best')}>
              Best sellers
            </button>
          </div>
          <div className="hidden sm:flex gap-2 text-ink">
            <ChevronLeft size={20} />
            <ChevronRight size={20} />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 max-w-[900px] gap-x-6 gap-y-10" aria-busy="true" aria-label="Loading products">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-meta" />
                <div className="mt-3 h-4 bg-meta w-3/4" />
                <div className="mt-2 h-4 bg-meta w-1/3" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="text-ink-soft">
            {error ? 'We could not load products right now. Please try again shortly.' : 'No products to show yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 max-w-[900px] gap-x-6 gap-y-10">
            {list.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="bg-meta py-12 md:py-16">
        <div className="container-aura">
          <h2 className="text-2xl md:text-3xl font-medium mb-8">Shop by concern</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => (
              <Link key={cat.label} to={cat.to} className="group bg-white">
                <div className="aspect-square overflow-hidden bg-white">
                  <img
                    src={cat.image}
                    alt=""
                    className="w-full h-full object-contain p-6 group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <p className="text-center py-3 label-wide text-ink-soft">{cat.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-aura py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <p className="label-wide text-ink-soft mb-3">Why Aura Beauty Care</p>
          <h2 className="text-3xl md:text-4xl font-medium leading-tight">
            Authentic skincare, delivered across Islamabad and Rawalpindi
          </h2>
          <p className="mt-4 text-ink-soft leading-relaxed">
            We started Aura Beauty Care so you can shop genuine SADOER collagen masks, Hero Cosmetics
            Mighty Patch, and SOME BY MI without guessing what is real. Every order is confirmed on
            WhatsApp. Cash on delivery is available, and we deliver across Islamabad and Rawalpindi.
          </p>
          <Link to="/about" className="btn-lavender inline-block w-auto px-8 mt-6">
            Our story
          </Link>
        </div>
        <img
          src="/products/mighty-patch/2.jpg"
          alt="Mighty Patch Invisible+ applied for daytime wear"
          className="w-full max-h-[420px] object-cover"
        />
      </section>
    </>
  )
}
