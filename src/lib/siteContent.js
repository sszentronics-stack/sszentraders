import { useEffect, useState } from 'react'
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
  }
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
