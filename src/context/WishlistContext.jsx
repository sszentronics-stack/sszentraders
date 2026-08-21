import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { getPublicImageUrl } from '../lib/supabase/storage'
import { toMajorUnits } from '../../backend/lib/money'
import * as wishlistApi from '../repositories/wishlist.repository'
import { useAuth } from './AuthContext'

const WishlistContext = createContext(null)
const STORAGE_KEY = 'aura-beauty-wishlist'

/**
 * Same dual-mode shape as CartContext: server-backed (backend/services/cart/
 * wishlist.service.ts) when Supabase is configured, a plain array of
 * product ids in localStorage otherwise. Fallback mode intentionally keeps
 * only ids (not full product data) — pages that need to render fallback
 * wishlist items cross-reference useProducts()' already-loaded list, same
 * as useCatalog.js's "derive everything in memory" approach.
 */
function mapItems(items) {
  return items.map((item) => ({
    productId: item.productId,
    slug: item.productSlug,
    name: item.productName,
    price: item.price != null ? toMajorUnits(item.price) : null,
    compareAt: item.compareAtPrice != null ? toMajorUnits(item.compareAtPrice) : null,
    image: getPublicImageUrl('product-images', item.imagePath) ?? '',
    addedAt: item.addedAt,
  }))
}

export function WishlistProvider({ children }) {
  const configured = isSupabaseConfigured()
  const { session, ensureGuestSession } = useAuth()

  const [productIds, setProductIds] = useState(() => {
    if (configured) return []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (configured) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(productIds))
  }, [configured, productIds])

  const reload = useCallback(async () => {
    if (!configured) return
    try {
      setItems(mapItems(await wishlistApi.listWishlist()))
    } catch (err) {
      console.error('Failed to load wishlist.', err)
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    async function sync() {
      try {
        await ensureGuestSession()
      } catch (err) {
        console.error('Failed to establish a wishlist session.', err)
      }
      if (!cancelled) await reload()
    }
    sync()
    return () => {
      cancelled = true
    }
  }, [configured, session?.user?.id, ensureGuestSession, reload])

  const isWishlisted = useCallback(
    (productId) => (configured ? items.some((item) => item.productId === productId) : productIds.includes(productId)),
    [configured, items, productIds],
  )

  const toggle = useCallback(
    async (product) => {
      const productId = product.id
      if (!configured) {
        setProductIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]))
        return
      }
      try {
        await ensureGuestSession()
        if (isWishlisted(productId)) {
          setItems(mapItems(await wishlistApi.removeFromWishlist(productId)))
        } else {
          setItems(mapItems(await wishlistApi.addToWishlist(productId)))
        }
      } catch (err) {
        console.error('Failed to update wishlist.', err)
      }
    },
    [configured, ensureGuestSession, isWishlisted],
  )

  const value = useMemo(
    () => ({
      items,
      productIds: configured ? items.map((item) => item.productId) : productIds,
      isWishlisted,
      toggle,
      loading,
    }),
    [items, configured, productIds, isWishlisted, toggle, loading],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider')
  return ctx
}
