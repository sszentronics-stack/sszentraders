/**
 * Recently-viewed persistence (Phase 5) surfaced as a storefront hook
 * (Phase 4's product page rail). Same dual-mode shape as CartContext/
 * WishlistContext: server-backed when Supabase is configured, a capped
 * localStorage id list otherwise — never more than LIMIT entries either
 * way ("privacy-conscious limits" per spec).
 */
import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { getPublicImageUrl } from '../lib/supabase/storage'
import { toMajorUnits } from '../../backend/lib/money'
import * as api from '../repositories/recentlyViewed.repository'
import { useProducts } from './useCatalog'

const STORAGE_KEY = 'aura-beauty-recently-viewed'
const LIMIT = 12

function readLocalIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocalIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, LIMIT)))
}

/** Record a product view — call once from the product detail page. */
export function useRecordRecentlyViewed(productId) {
  const configured = isSupabaseConfigured()
  useEffect(() => {
    if (!productId) return
    if (configured) {
      api.recordRecentlyViewed(productId).catch((err) => console.error('Failed to record recently viewed product.', err))
    } else {
      writeLocalIds([productId, ...readLocalIds().filter((id) => id !== productId)])
    }
  }, [configured, productId])
}

/**
 * List recently viewed products (excluding `excludeId` — typically the
 * product currently on screen) as ProductCard-ready items.
 * @param {string|undefined} excludeId
 */
export function useRecentlyViewed(excludeId) {
  const configured = isSupabaseConfigured()
  const { products } = useProducts()
  const [serverItems, setServerItems] = useState([])
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    api
      .listRecentlyViewed()
      .then((items) => {
        if (!cancelled) setServerItems(items)
      })
      .catch((err) => console.error('Failed to load recently viewed products.', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configured, excludeId])

  const items = configured
    ? serverItems
        .filter((item) => item.productId !== excludeId)
        .map((item) => ({
          id: item.productId,
          slug: item.productSlug,
          name: item.productName,
          price: item.price != null ? toMajorUnits(item.price) : 0,
          compareAt: item.compareAtPrice != null ? toMajorUnits(item.compareAtPrice) : 0,
          images: [getPublicImageUrl('product-images', item.imagePath) ?? ''],
          badge: null,
        }))
    : readLocalIds()
        .filter((id) => id !== excludeId)
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean)

  return { items, loading }
}
