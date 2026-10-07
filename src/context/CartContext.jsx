import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { getPublicImageUrl } from '../lib/supabase/storage'
import { toMajorUnits } from '../../backend/lib/money'
import * as cartApi from '../repositories/cart.repository'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)
const STORAGE_KEY = 'aura-beauty-cart'
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isServerId(id) {
  return SERVER_ID.test(String(id ?? ''))
}

function readLocalCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Phase 5: when Supabase is configured, the cart is server-backed
 * (backend/services/cart/cart.service.ts) — every add/update/remove hits
 * the `cart` Edge Function and the response is the server's authoritative,
 * revalidated CartSummary (never a client-computed total). When it isn't
 * configured (this dev environment, per docs/phase-3-completion-report.md),
 * behavior is UNCHANGED from before Phase 5: plain localStorage, trusting
 * whatever price the product prop carries. This mirrors the exact
 * graceful-fallback pattern src/hooks/useCatalog.js established in Phase 3.
 */
function mapSummaryToItems(summary) {
  return summary.items.map((item) => ({
    id: item.itemId,
    variantId: item.variantId,
    slug: item.productSlug,
    name: item.productName,
    price: toMajorUnits(item.unitPrice),
    image: getPublicImageUrl('product-images', item.imagePath) ?? '',
    qty: item.quantity,
    priceChanged: item.priceChanged,
    quantityAdjusted: item.quantityAdjusted,
  }))
}

export function CartProvider({ children }) {
  const configured = isSupabaseConfigured()
  const { session, ensureGuestSession } = useAuth()

  const [items, setItems] = useState(readLocalCart)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(configured)
  const [removedNotice, setRemovedNotice] = useState(null)

  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  const prevUserRef = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const applySummary = useCallback((summary) => {
    const incoming = Array.isArray(summary?.items) ? mapSummaryToItems(summary) : null
    if (!incoming) return
    setItems((prev) => {
      const covered = new Set(incoming.map((item) => item.variantId).filter(Boolean))
      const localItems = prev.filter((item) => item.local || !isServerId(item.id))
      const kept = localItems.filter((item) => !item.variantId || !covered.has(item.variantId))
      return [...kept, ...incoming]
    })
    const removedCount = summary.removedItems?.length ?? 0
    const adjustedCount = summary.items?.filter((item) => item.quantityAdjusted).length ?? 0
    const notices = []
    if (removedCount > 0) {
      notices.push(
        `${removedCount} item${removedCount === 1 ? '' : 's'} in your cart ${removedCount === 1 ? 'is' : 'are'} no longer available and ${removedCount === 1 ? 'was' : 'were'} removed.`,
      )
    }
    if (adjustedCount > 0) {
      notices.push(
        `${adjustedCount} item${adjustedCount === 1 ? '' : 's'} in your cart ${adjustedCount === 1 ? 'was' : 'were'} reduced to match what's currently in stock.`,
      )
    }
    setRemovedNotice(notices.length ? notices.join(' ') : null)
  }, [])

  const reload = useCallback(async () => {
    if (!configured) return
    try {
      applySummary(await cartApi.getCart())
    } catch (err) {
      console.error('Failed to load cart.', err)
    } finally {
      setLoading(false)
    }
  }, [configured, applySummary])

  // Establish a guest/authenticated identity, then load the server cart —
  // and, on a guest -> authenticated transition, merge whatever the guest
  // was holding into the now-current profile's cart first (see
  // src/repositories/cart.repository.ts mergeCart + backend's
  // mergeCartItems for the deterministic merge itself).
  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return undefined
    }
    let cancelled = false

    async function sync() {
      const user = session?.user
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }
      if (cancelled) return

      const prev = prevUserRef.current
      if (prev && prev.id !== user.id && prev.isAnon && !user.is_anonymous) {
        const snapshot = itemsRef.current
          .filter((item) => item.variantId)
          .map((item) => ({ variantId: item.variantId, quantity: item.qty }))
        if (snapshot.length > 0) {
          try {
            await cartApi.mergeCart(snapshot)
          } catch (err) {
            console.error('Failed to merge guest cart into account.', err)
          }
        }
      }
      prevUserRef.current = { id: user.id, isAnon: Boolean(user.is_anonymous) }

      if (!cancelled) await reload()
    }

    sync()
    return () => {
      cancelled = true
    }
  }, [configured, session?.user?.id, session?.user?.is_anonymous, reload])

  const rememberLocalItem = useCallback((product, qty) => {
    const variantId = product.variantId ?? (isServerId(product.id) ? product.id : undefined)
    const id = variantId ? `local:${variantId}` : product.id
    setItems((prev) => {
      const existing = prev.find((item) => item.id === id || item.id === product.id || (variantId && item.variantId === variantId))
      if (existing) {
        return prev.map((item) => (item.id === existing.id ? { ...item, qty: item.qty + qty } : item))
      }
      return [...prev, {
        id,
        variantId,
        local: true,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.images?.[0],
        qty,
      }]
    })
    setIsOpen(true)
  }, [])

  const syncToServer = useCallback(async () => {
    if (!configured) return
    await ensureGuestSession()
    const lines = itemsRef.current
      .map((item) => ({
        variantId: item.variantId ?? (isServerId(item.id) ? item.id : null),
        quantity: item.qty,
      }))
      .filter((line) => isServerId(line.variantId) && line.quantity > 0)
    if (lines.length === 0) {
      throw new Error('Your cart could not be saved. Refresh the page and add the product again.')
    }
    applySummary(await cartApi.mergeCart(lines))
  }, [configured, ensureGuestSession, applySummary])

  const addItem = useCallback(
    async (product, qty = 1) => {
      rememberLocalItem(product, qty)
      const variantId = product.variantId ?? (isServerId(product.id) ? product.id : undefined)
      if (!configured || !isServerId(variantId)) return
      try {
        await ensureGuestSession()
        applySummary(await cartApi.addCartItem(variantId, qty))
      } catch (err) {
        console.error('Failed to add item to cart.', err)
      }
    },
    [configured, applySummary, rememberLocalItem, ensureGuestSession],
  )

  const updateQty = useCallback(
    async (id, qty) => {
      if (!configured || !isServerId(id)) {
        setItems((prev) =>
          qty < 1 ? prev.filter((item) => item.id !== id) : prev.map((item) => (item.id === id ? { ...item, qty } : item)),
        )
        return
      }
      try {
        applySummary(qty < 1 ? await cartApi.removeCartItem(id) : await cartApi.updateCartItemQuantity(id, qty))
      } catch (err) {
        console.error('Failed to update cart item.', err)
      }
    },
    [configured, applySummary],
  )

  const removeItem = useCallback(
    async (id) => {
      if (!configured || !isServerId(id)) {
        setItems((prev) => prev.filter((item) => item.id !== id))
        return
      }
      try {
        applySummary(await cartApi.removeCartItem(id))
      } catch (err) {
        console.error('Failed to remove cart item.', err)
      }
    },
    [configured, applySummary],
  )

  const clearCart = useCallback(async () => {
    setItems((prev) => prev.filter((item) => isServerId(item.id)))
    if (!configured) return
    try {
      setItems(mapSummaryToItems(await cartApi.clearCart()))
    } catch (err) {
      console.error('Failed to clear cart.', err)
    }
  }, [configured, applySummary])

  const dismissRemovedNotice = useCallback(() => setRemovedNotice(null), [])

  /** Phase 13: re-add a past order's items to the current cart (server re-checks price/availability — see backend/services/cart/cart.service.ts::reorderToCart). Returns { addedCount, skipped } so the caller can tell the customer what didn't make it back in. */
  const reorder = useCallback(
    async (orderId) => {
      if (!configured) return { addedCount: 0, skipped: [] }
      const result = await cartApi.reorder(orderId)
      applySummary(result.cart)
      setIsOpen(true)
      return { addedCount: result.addedCount, skipped: result.skipped }
    },
    [configured, applySummary],
  )

  const count = items.reduce((sum, item) => sum + item.qty, 0)
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0)

  const value = useMemo(
    () => ({
      items,
      count,
      total,
      isOpen,
      setIsOpen,
      addItem,
      updateQty,
      removeItem,
      clearCart,
      syncToServer,
      reorder,
      loading,
      removedNotice,
      dismissRemovedNotice,
    }),
    [items, count, total, isOpen, addItem, updateQty, removeItem, clearCart, syncToServer, reorder, loading, removedNotice, dismissRemovedNotice],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
