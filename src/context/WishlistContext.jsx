import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { getPublicImageUrl } from '../lib/supabase/storage'
import { toMajorUnits } from '../../backend/lib/money'
import * as wishlistApi from '../repositories/wishlist.repository'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'

const WishlistContext = createContext(null)
const STORAGE_KEY = 'aura-beauty-wishlist'
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isServerId(id) {
  return SERVER_ID.test(String(id ?? ''))
}

function readLocalWishlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

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
  const { session } = useAuth()
  const toast = useToast()

  const [productIds, setProductIds] = useState(readLocalWishlist)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(productIds))
  }, [productIds])

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
      if (!session?.user || session.user.is_anonymous) {
        if (!cancelled) setLoading(false)
        return
      }
      if (!cancelled) await reload()
    }
    sync()
    return () => {
      cancelled = true
    }
  }, [configured, session?.user?.id, reload])

  const isWishlisted = useCallback(
    (productId) => productIds.includes(productId) || items.some((item) => item.productId === productId),
    [items, productIds],
  )

  const toggle = useCallback(
    async (product) => {
      const productId = product.id
      const rememberLocal = () => {
        const wasWishlisted = productIds.includes(productId)
        setProductIds((prev) => (wasWishlisted ? prev.filter((id) => id !== productId) : [...prev, productId]))
        toast.success(wasWishlisted ? 'Removed from wishlist' : 'Added to wishlist')
      }
      if (!configured || !isServerId(productId)) {
        rememberLocal()
        return
      }
      try {
        if (isWishlisted(productId)) {
          setItems(mapItems(await wishlistApi.removeFromWishlist(productId)))
          toast.success('Removed from wishlist')
        } else {
          setItems(mapItems(await wishlistApi.addToWishlist(productId)))
          toast.success('Added to wishlist')
        }
      } catch (err) {
        console.error('Failed to update wishlist.', err)
        rememberLocal()
      }
    },
    [configured, isWishlisted, productIds, toast],
  )

  const value = useMemo(
    () => ({
      items,
      productIds: [...new Set([...productIds, ...items.map((item) => item.productId)])],
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
