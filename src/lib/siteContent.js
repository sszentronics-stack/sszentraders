import { useEffect, useState } from 'react'
import { PRODUCT_DISCLAIMER, products as fallbackProducts } from '../data/products'
import { isSupabaseConfigured, getSupabaseBrowserClient } from './supabase/client'

const STORAGE_KEY = 'sszentraders.site-content'
const EVENT = 'sszentraders-content'
const ROW_ID = 'storefront'

export const SITE_CONTENT_LIMITS = { stories: 12, slides: 8, brands: 12 }

const SITE_ASSET_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

const SITE_VIDEO_TYPES = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

const IMAGE_LIMIT = 5 * 1024 * 1024
const VIDEO_LIMIT = 40 * 1024 * 1024

export const DEFAULT_SITE_CONTENT = {
  logo: '/logo.png',
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
        { to: '/products/sadoer-collagen-anti-aging-facial-mask', label: 'Get this product' },
      ],
    },
    {
      image: '/banners/some-by-mi-banner.jpg',
      heading: 'SOME BY MI 30 Days Miracle Toner',
      text: 'AHA, BHA and PHA in one daily toner.',
      actions: [{ to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner', label: 'Get this product' }],
    },
    {
      image: '/banners/mighty-patch-banner.jpg',
      heading: 'Hero Mighty Patch Invisible+',
      text: 'A thin patch for daytime wear.',
      actions: [{ to: '/products/hero-mighty-patch-invisible-plus', label: 'Get this product' }],
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
    { label: 'SADOER', to: '/products/sadoer-collagen-anti-aging-facial-mask', image: '/products/sadoer-collagen/1.png', storyImage: '/products/sadoer-collagen/1.png' },
    { label: 'Hero', to: '/products/hero-mighty-patch-invisible-plus', image: '/products/mighty-patch/1.jpg', storyImage: '/products/mighty-patch/1.jpg' },
    { label: 'SOME BY MI', to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner', image: '/products/some-by-mi/1.jpg', storyImage: '/products/some-by-mi/1.jpg' },
    { label: 'Masks', to: '/products/sadoer-collagen-anti-aging-facial-mask', image: '/products/sadoer-collagen/2.png', storyImage: '/products/sadoer-collagen/2.png' },
    { label: 'Toners', to: '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner', image: '/products/some-by-mi/2.jpg', storyImage: '/products/some-by-mi/2.jpg' },
    { label: 'Patches', to: '/products/hero-mighty-patch-invisible-plus', image: '/products/mighty-patch/2.jpg', storyImage: '/products/mighty-patch/2.jpg' },
  ],
  brands: [
    { label: 'SADOER', to: '/shop?brand=SADOER', image: '/brands/sadoer.svg' },
    { label: 'Hero Cosmetics', to: '/shop?brand=Hero%20Cosmetics', image: '/brands/hero.svg' },
    { label: 'SOME BY MI', to: '/shop?brand=SOME%20BY%20MI', image: '/brands/some-by-mi.svg' },
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
    image: '/about/iderma-care.png',
    alt: 'iDermaCare clinical skincare',
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
  if (/^https:\/\/\S+$/i.test(next)) return next.slice(0, 800)
  return fallback || ''
}

function plain(value, fallback, max) {
  const next = String(value ?? '').trim().slice(0, max)
  return next || fallback
}

function takeList(source, fallback, limit) {
  const list = Array.isArray(source) ? source : fallback
  return list.slice(0, limit)
}

const LEGACY_STORY_LINKS = {
  '/shop?brand=SADOER': '/products/sadoer-collagen-anti-aging-facial-mask',
  '/shop?brand=Hero%20Cosmetics': '/products/hero-mighty-patch-invisible-plus',
  '/shop?brand=SOME%20BY%20MI': '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner',
  '/shop?category=Masks': '/products/sadoer-collagen-anti-aging-facial-mask',
  '/shop?category=Toners': '/products/some-by-mi-aha-bha-pha-30-days-miracle-toner',
  '/shop?category=Acne%20Care': '/products/hero-mighty-patch-invisible-plus',
}

function storyItem(incoming, index) {
  const fallback = DEFAULT_SITE_CONTENT.stories[index] || { label: 'Story', to: '/shop', image: '', storyImage: '' }
  const image = incoming?.image === '' ? '' : path(incoming?.image, fallback.image)
  const savedLink = LEGACY_STORY_LINKS[String(incoming?.to ?? '').trim()] || incoming?.to
  const mediaType = incoming?.mediaType === 'video' ? 'video' : 'image'
  const storyImage = incoming?.storyImage === '' ? '' : (path(incoming?.storyImage, fallback.storyImage || image) || image)
  return {
    label: text(incoming?.label, fallback.label, 40),
    to: path(savedLink, fallback.to),
    image,
    storyImage,
    mediaType,
    storyVideo: mediaType === 'video' ? path(incoming?.storyVideo, '') : '',
  }
}

function watchClips(source) {
  const incoming = source?.watch?.clips
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { ...DEFAULT_SITE_CONTENT.watch.clips }
  }
  return Object.fromEntries(
    Object.entries(incoming)
      .map(([slug, value]) => [String(slug).slice(0, 80), path(value, '')])
      .filter(([slug, value]) => /^[a-z0-9-]+$/i.test(slug) && value),
  )
}

function brandItem(incoming, index) {
  const fallback = DEFAULT_SITE_CONTENT.brands[index] || { label: 'Brand', to: '/shop', image: '' }
  return {
    label: text(incoming?.label, fallback.label, 40),
    to: path(incoming?.to, fallback.to),
    image: path(incoming?.image, fallback.image),
  }
}

function slideItem(incoming, index) {
  const fallback = DEFAULT_SITE_CONTENT.slides[index] || {
    image: '',
    heading: 'Banner',
    text: '',
    actions: [{ to: '/shop', label: 'Get this product' }],
  }
  const incomingActions = Array.isArray(incoming?.actions) ? incoming.actions.slice(0, 2) : []
  const actionSource = incomingActions.length ? incomingActions : fallback.actions
  return {
    image: path(incoming?.image, fallback.image),
    heading: text(incoming?.heading, fallback.heading, 120),
    text: text(incoming?.text, fallback.text, 240),
    actions: actionSource.map((action, actionIndex) => {
      const fallbackAction = fallback.actions[actionIndex] || { label: 'Get this product', to: '/shop' }
      return {
        label: text(action?.label, fallbackAction.label, 40),
        to: path(action?.to, fallbackAction.to),
        ...(fallbackAction.ghost || action?.ghost ? { ghost: true } : {}),
      }
    }),
  }
}

export function normalizeSiteContent(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    announcements: DEFAULT_SITE_CONTENT.announcements.map((fallback, index) =>
      text(source.announcements?.[index], fallback, 120),
    ),
    logo: path(source.logo, DEFAULT_SITE_CONTENT.logo),
    slides: takeList(source.slides, DEFAULT_SITE_CONTENT.slides, SITE_CONTENT_LIMITS.slides).map(slideItem),
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
    stories: takeList(source.stories, DEFAULT_SITE_CONTENT.stories, SITE_CONTENT_LIMITS.stories).map(storyItem),
    brands: takeList(source.brands, DEFAULT_SITE_CONTENT.brands, SITE_CONTENT_LIMITS.brands).map(brandItem),
    watch: {
      heading: text(source.watch?.heading, DEFAULT_SITE_CONTENT.watch.heading, 80),
      lead: text(source.watch?.lead, DEFAULT_SITE_CONTENT.watch.lead, 160),
      clips: watchClips(source),
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
      image: path(source.about?.image, DEFAULT_SITE_CONTENT.about.image) === '/products/mighty-patch/1.jpg'
        ? DEFAULT_SITE_CONTENT.about.image
        : path(source.about?.image, DEFAULT_SITE_CONTENT.about.image),
      alt: text(source.about?.alt, DEFAULT_SITE_CONTENT.about.alt, 160) === 'Hero Mighty Patch Invisible+'
        ? DEFAULT_SITE_CONTENT.about.alt
        : text(source.about?.alt, DEFAULT_SITE_CONTENT.about.alt, 160),
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
        image: incoming.image === '' ? '' : path(incoming.image, product.image),
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

export async function uploadSiteAsset(file, folder = 'images') {
  if (!isSupabaseConfigured()) {
    throw new Error('Connect Supabase to upload files. You can still paste an address.')
  }
  const imageExt = SITE_ASSET_TYPES[file?.type]
  const videoExt = SITE_VIDEO_TYPES[file?.type]
  const ext = imageExt || videoExt
  if (!ext) throw new Error('Use a JPG, PNG, WebP, GIF, SVG, MP4, or WebM file.')
  const limit = videoExt ? VIDEO_LIMIT : IMAGE_LIMIT
  if (file.size > limit) {
    throw new Error(videoExt ? 'Videos must be 40 MB or smaller.' : 'Images must be 5 MB or smaller.')
  }
  const safeFolder = String(folder).replace(/[^a-z0-9-]/gi, '') || 'images'
  const storagePath = `${safeFolder}/${crypto.randomUUID()}.${ext}`
  const client = getSupabaseBrowserClient()
  const { error } = await client.storage.from('site-assets').upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message || 'Could not upload the image.')
  const { data } = client.storage.from('site-assets').getPublicUrl(storagePath)
  if (!data?.publicUrl) throw new Error('Could not read the uploaded image address.')
  return data.publicUrl
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
