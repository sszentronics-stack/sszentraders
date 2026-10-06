import { useEffect, useState } from 'react'
import { PRODUCT_DISCLAIMER, products as fallbackProducts } from '../data/products'
import { isSupabaseConfigured, getSupabaseBrowserClient } from './supabase/client'

const STORAGE_KEY = 'sszentraders.site-content'
const EVENT = 'sszentraders-content'
const ROW_ID = 'storefront'

export const DEFAULT_SITE_CONTENT = {
  announcements: [
    'Cash on delivery available',
    'Every order confirmed on WhatsApp',
    '7-day easy returns and exchanges',
  ],
  slides: [
    {
      image: '/banners/sadoer-collagen-banner.jpg',
      heading: 'Authentic skincare, without the guesswork',
      text: 'Genuine products, confirmed with you on WhatsApp before they ship.',
      actions: [
        { to: '/shop', label: 'Shop all products' },
        { to: '/about', label: 'See our brands', ghost: true },
      ],
    },
    {
      image: '/banners/some-by-mi-banner.jpg',
      heading: 'SOME BY MI 30 Days Miracle Toner',
      text: 'AHA, BHA and PHA in one daily toner.',
      actions: [{ to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner', label: 'Shop the toner' }],
    },
    {
      image: '/banners/mighty-patch-banner.jpg',
      heading: 'Hero Mighty Patch Invisible+',
      text: 'A thin patch for daytime wear.',
      actions: [{ to: '/products/hero-mighty-patch-invisible-plus', label: 'Shop Mighty Patch' }],
    },
  ],
  story: {
    image: '/products/story-trio.jpg',
    alt: 'Hero Mighty Patch, SOME BY MI toner, and SADOER collagen mask',
    heading: 'A short list, chosen carefully',
    text: 'SS Zen Traders keeps three products in stock: the SADOER collagen mask, Hero Mighty Patch Invisible+, and SOME BY MI 30 Days Miracle Toner. Every order is confirmed on WhatsApp before it leaves the office in G-13/3, Islamabad.',
    linkLabel: 'Read our story',
    linkTo: '/about',
  },
  business: {
    name: 'SS Zen Traders',
    address: 'Office#14, First Floor, Farooq 2D Plaza, G-13/3, Islamabad',
    phone: '03079594474',
    email: 'info@sszentraders.com',
    whatsapp: '923079594474',
    whatsappGreeting: 'Hi SS Zen Traders! I have a question about your products.',
  },
  home: {
    featuredHeading: 'Featured products',
    viewAllLabel: 'View all',
    brandHeading: 'Shop by brand',
  },
  stories: [
    { label: 'SADOER', to: '/shop?brand=SADOER', image: '/products/sadoer-collagen/1.png' },
    { label: 'Hero', to: '/shop?brand=Hero%20Cosmetics', image: '/products/mighty-patch/1.jpg' },
    { label: 'SOME BY MI', to: '/shop?brand=SOME%20BY%20MI', image: '/products/some-by-mi/1.jpg' },
    { label: 'Masks', to: '/shop?category=Masks', image: '/products/sadoer-collagen/2.png' },
    { label: 'Toners', to: '/shop?category=Toners', image: '/products/some-by-mi/2.jpg' },
    { label: 'Patches', to: '/shop?category=Acne%20Care', image: '/products/mighty-patch/2.jpg' },
  ],
  brands: [
    { label: 'SADOER', to: '/shop?brand=SADOER', image: '/products/sadoer-collagen/1.png' },
    { label: 'Hero Cosmetics', to: '/shop?brand=Hero%20Cosmetics', image: '/products/mighty-patch/1.jpg' },
    { label: 'SOME BY MI', to: '/shop?brand=SOME%20BY%20MI', image: '/products/some-by-mi/1.jpg' },
  ],
  watch: {
    heading: 'Watch and shop',
    lead: 'Short clips of the products in stock.',
    clips: {
      'sadoer-collagen-anti-aging-facial-mask': '/videos/sadoer.mp4',
      'hero-mighty-patch-invisible-plus': '/videos/mighty-patch.mp4',
      'some-by-mi-aha-bha-pha-30-days-miracle-toner': '/videos/some-by-mi.mp4',
    },
  },
  reviews: {
    heading: 'What customers say',
    items: [
      { image: '/reviews/review-1.jpg', rating: '5', text: 'The collagen mask left my skin soft by morning.' },
      { image: '/reviews/review-2.jpg', rating: '5', text: 'Mighty Patch stays flat and is easy to wear out.' },
      { image: '/reviews/review-3.jpg', rating: '5', text: 'The SOME BY MI toner is gentle enough for every day.' },
      { image: '/reviews/review-4.jpg', rating: '4', text: 'The sheet sits close to the face and feels light.' },
      { image: '/reviews/review-5.jpg', rating: '5', text: 'The patch is thin enough to wear in the daytime.' },
      { image: '/reviews/review-6.jpg', rating: '4', text: 'A clear toner step I can use on a cotton pad.' },
      { image: '/reviews/review-7.jpg', rating: '5', text: 'I use the collagen mask two evenings a week.' },
      { image: '/reviews/review-8.jpg', rating: '5', text: 'Cash on delivery and a WhatsApp confirmation made ordering simple.' },
    ],
  },
  trust: ['Cash on delivery', 'WhatsApp confirmation', '7-day returns'],
  about: {
    title: 'About us',
    image: '/products/mighty-patch/1.jpg',
    alt: 'Hero Mighty Patch Invisible+',
    paragraphs: [
      'SS Zen Traders keeps a short list of authentic skincare: the SADOER collagen mask, Hero Mighty Patch Invisible+, and SOME BY MI 30 Days Miracle Toner.',
      'The office is at Office#14, First Floor, Farooq 2D Plaza, G-13/3, Islamabad. Call 03079594474 or email info@sszentraders.com. Every order is confirmed on WhatsApp, and cash on delivery is available.',
      'Always read the label on the product you receive. Packaging and ingredients can change, and our listings are for reference.',
    ],
  },
  contact: {
    title: 'Contact',
    whatsappLabel: 'Chat on WhatsApp',
  },
  disclaimer: PRODUCT_DISCLAIMER,
  policies: {
    privacy: {
      title: 'Privacy policy',
      body: 'SSzentronics collects only the information you share when you place an order — typically your name, WhatsApp number, city, and delivery address. We use this information to confirm and fulfill orders. We do not sell your personal information. Messages sent through WhatsApp are subject to WhatsApp’s own privacy terms. For questions, contact us on WhatsApp at +92 307 9594474.',
    },
    shipping: {
      title: 'Shipping policy',
      body: 'We deliver across Islamabad and Rawalpindi. Estimated delivery is 3–5 working days after order confirmation on WhatsApp. Shipping charges, if any, are confirmed before you pay. Please provide a complete address and an active phone number so the courier can reach you.',
    },
    refund: {
      title: 'Refund policy',
      body: 'We offer a 7-day easy return and exchange on unopened products in original packaging. Opened skincare cannot be returned for hygiene reasons unless the item is damaged or incorrect. If you receive a damaged or wrong product, send photos on WhatsApp within 48 hours of delivery. Approved refunds are processed via the original payment method or JazzCash / EasyPaisa / bank transfer.',
    },
    terms: {
      title: 'Terms of service',
      body: 'By shopping at SSzentronics you agree that product listings are for reference, prices may change without notice until an order is confirmed, and we may refuse or cancel orders in case of pricing errors, stock issues, or suspected fraud. Skincare results vary. You are responsible for reading labels and following directions. These terms are governed by the laws of Pakistan.',
    },
  },
  products: fallbackProducts.map((product) => ({
    slug: product.slug,
    name: product.name,
    price: String(product.price),
    compareAt: String(product.compareAt ?? ''),
    tagline: product.tagline,
    description: product.description,
    image: product.images[0],
  })),
}

function text(value, fallback, max) {
  const next = String(value ?? '').trim().slice(0, max)
  return next || fallback
}

function path(value, fallback) {
  const next = String(value ?? '').trim()
  if (next.startsWith('/') && !next.startsWith('//')) return next.slice(0, 300)
  if (/^https:\/\/\S+$/i.test(next)) return next.slice(0, 500)
  return fallback
}

function plain(value, fallback, max) {
  const next = String(value ?? '').trim().slice(0, max)
  return next || fallback
}

function cards(source, fallback) {
  return fallback.map((item, index) => {
    const incoming = source?.[index] ?? {}
    return {
      label: text(incoming.label, item.label, 40),
      to: path(incoming.to, item.to),
      image: path(incoming.image, item.image),
    }
  })
}

export function normalizeSiteContent(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    announcements: DEFAULT_SITE_CONTENT.announcements.map((fallback, index) =>
      text(source.announcements?.[index], fallback, 120),
    ),
    slides: DEFAULT_SITE_CONTENT.slides.map((fallback, index) => {
      const slide = source.slides?.[index] ?? {}
      const actions = fallback.actions.map((action, actionIndex) => {
        const incoming = Array.isArray(slide.actions) ? slide.actions[actionIndex] : null
        return {
          label: text(incoming?.label, action.label, 40),
          to: path(incoming?.to, action.to),
          ...(action.ghost ? { ghost: true } : {}),
        }
      })
      return {
        image: path(slide.image, fallback.image),
        heading: text(slide.heading, fallback.heading, 120),
        text: text(slide.text, fallback.text, 240),
        actions,
      }
    }),
    story: {
      image: path(source.story?.image, DEFAULT_SITE_CONTENT.story.image),
      alt: text(source.story?.alt, DEFAULT_SITE_CONTENT.story.alt, 160),
      heading: text(source.story?.heading, DEFAULT_SITE_CONTENT.story.heading, 120),
      text: text(source.story?.text, DEFAULT_SITE_CONTENT.story.text, 600),
      linkLabel: text(source.story?.linkLabel, DEFAULT_SITE_CONTENT.story.linkLabel, 40),
      linkTo: path(source.story?.linkTo, DEFAULT_SITE_CONTENT.story.linkTo),
    },
    business: {
      name: text(source.business?.name, DEFAULT_SITE_CONTENT.business.name, 80),
      address: text(source.business?.address, DEFAULT_SITE_CONTENT.business.address, 200),
      phone: plain(source.business?.phone, DEFAULT_SITE_CONTENT.business.phone, 40),
      email: plain(source.business?.email, DEFAULT_SITE_CONTENT.business.email, 120),
      whatsapp: plain(source.business?.whatsapp, DEFAULT_SITE_CONTENT.business.whatsapp, 20).replace(/[^\d]/g, '') || DEFAULT_SITE_CONTENT.business.whatsapp,
      whatsappGreeting: text(source.business?.whatsappGreeting, DEFAULT_SITE_CONTENT.business.whatsappGreeting, 200),
    },
    home: {
      featuredHeading: text(source.home?.featuredHeading, DEFAULT_SITE_CONTENT.home.featuredHeading, 80),
      viewAllLabel: text(source.home?.viewAllLabel, DEFAULT_SITE_CONTENT.home.viewAllLabel, 40),
      brandHeading: text(source.home?.brandHeading, DEFAULT_SITE_CONTENT.home.brandHeading, 80),
    },
    stories: cards(source.stories, DEFAULT_SITE_CONTENT.stories),
    brands: cards(source.brands, DEFAULT_SITE_CONTENT.brands),
    watch: {
      heading: text(source.watch?.heading, DEFAULT_SITE_CONTENT.watch.heading, 80),
      lead: text(source.watch?.lead, DEFAULT_SITE_CONTENT.watch.lead, 160),
      clips: Object.fromEntries(Object.entries(DEFAULT_SITE_CONTENT.watch.clips).map(([slug, fallback]) => [
        slug,
        path(source.watch?.clips?.[slug], fallback),
      ])),
    },
    reviews: {
      heading: text(source.reviews?.heading, DEFAULT_SITE_CONTENT.reviews.heading, 80),
      items: DEFAULT_SITE_CONTENT.reviews.items.map((item, index) => {
        const incoming = source.reviews?.items?.[index] ?? {}
        const rating = Number(incoming.rating)
        return {
          image: String(incoming.image || '').startsWith('/products/') ? item.image : path(incoming.image, item.image),
          rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? String(Math.round(rating)) : item.rating,
          text: text(incoming.text, item.text, 180),
        }
      }),
    },
    trust: DEFAULT_SITE_CONTENT.trust.map((item, index) => text(source.trust?.[index], item, 80)),
    about: {
      title: text(source.about?.title, DEFAULT_SITE_CONTENT.about.title, 80),
      image: path(source.about?.image, DEFAULT_SITE_CONTENT.about.image),
      alt: text(source.about?.alt, DEFAULT_SITE_CONTENT.about.alt, 160),
      paragraphs: DEFAULT_SITE_CONTENT.about.paragraphs.map((item, index) => text(source.about?.paragraphs?.[index], item, 600)),
    },
    contact: {
      title: text(source.contact?.title, DEFAULT_SITE_CONTENT.contact.title, 80),
      whatsappLabel: text(source.contact?.whatsappLabel, DEFAULT_SITE_CONTENT.contact.whatsappLabel, 40),
    },
    disclaimer: text(source.disclaimer, DEFAULT_SITE_CONTENT.disclaimer, 4000),
    policies: Object.fromEntries(Object.entries(DEFAULT_SITE_CONTENT.policies).map(([key, page]) => [key, {
      title: text(source.policies?.[key]?.title, page.title, 80),
      body: text(source.policies?.[key]?.body, page.body, 4000),
    }])),
    products: DEFAULT_SITE_CONTENT.products.map((product, index) => {
      const incoming = (source.products || []).find((item) => item?.slug === product.slug) ?? source.products?.[index] ?? {}
      const price = Number(incoming.price)
      const compareAt = Number(incoming.compareAt)
      return {
        slug: product.slug,
        name: text(incoming.name, product.name, 120),
        price: Number.isFinite(price) && price > 0 ? String(price) : product.price,
        compareAt: Number.isFinite(compareAt) && compareAt > 0 ? String(compareAt) : product.compareAt,
        tagline: text(incoming.tagline, product.tagline, 120),
        description: text(incoming.description, product.description, 2500),
        image: path(incoming.image, product.image),
      }
    }),
  }
}

export function applyProductEdits(products, content) {
  const edits = Object.fromEntries((content?.products || []).map((product) => [product.slug, product]))
  return (products || []).map((product) => {
    const edit = edits[product.slug]
    if (!edit) return product
    const price = Number(edit.price)
    const compareAt = Number(edit.compareAt)
    const image = edit.image && edit.image !== product.images?.[0] ? edit.image : null
    return {
      ...product,
      name: edit.name || product.name,
      tagline: edit.tagline || product.tagline,
      description: edit.description || product.description,
      price: Number.isFinite(price) && price > 0 ? price : product.price,
      compareAt: Number.isFinite(compareAt) && compareAt > 0 ? compareAt : product.compareAt,
      images: image ? [image, ...(product.images || []).slice(1)] : product.images,
    }
  })
}

export function orderCustomer(content, customer = {}) {
  const digits = String(content?.business?.whatsapp || DEFAULT_SITE_CONTENT.business.whatsapp).replace(/\D/g, '')
  const name = content?.business?.name || DEFAULT_SITE_CONTENT.business.name
  return {
    ...customer,
    greeting: `Hello ${name}, I would like to place an order:`,
    whatsappLink: `https://wa.me/${digits}`,
  }
}

export function whatsAppHref(content, message) {
  const digits = String(content?.business?.whatsapp || DEFAULT_SITE_CONTENT.business.whatsapp).replace(/\D/g, '')
  const text = message || content?.business?.whatsappGreeting || DEFAULT_SITE_CONTENT.business.whatsappGreeting
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeSiteContent(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function writeLocal(content) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(content))
    window.dispatchEvent(new Event(EVENT))
  } catch {
    window.dispatchEvent(new Event(EVENT))
  }
}

export async function loadSiteContent() {
  const local = readLocal()
  if (!isSupabaseConfigured()) return local ?? normalizeSiteContent(DEFAULT_SITE_CONTENT)
  try {
    const { data, error } = await getSupabaseBrowserClient()
      .from('site_content')
      .select('document')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error || !data?.document) return local ?? normalizeSiteContent(DEFAULT_SITE_CONTENT)
    const remote = normalizeSiteContent(data.document)
    writeLocal(remote)
    return remote
  } catch {
    return local ?? normalizeSiteContent(DEFAULT_SITE_CONTENT)
  }
}

export async function saveSiteContent(draft) {
  const next = normalizeSiteContent(draft)
  writeLocal(next)
  if (!isSupabaseConfigured()) return { content: next, remote: false }
  const { error } = await getSupabaseBrowserClient()
    .from('site_content')
    .upsert({ id: ROW_ID, document: next, updated_at: new Date().toISOString() })
  if (error) throw error
  return { content: next, remote: true }
}

export function useSiteContent() {
  const [content, setContent] = useState(() => readLocal() ?? normalizeSiteContent(DEFAULT_SITE_CONTENT))

  useEffect(() => {
    let cancelled = false
    loadSiteContent().then((value) => {
      if (!cancelled) setContent(value)
    })
    const refresh = () => setContent(readLocal() ?? normalizeSiteContent(DEFAULT_SITE_CONTENT))
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      cancelled = true
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return content
}
