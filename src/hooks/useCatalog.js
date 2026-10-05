/**
 * Storefront data-loading hooks — the single place pages ask for product
 * data, so they never have to know whether it came from Supabase or the
 * offline fallback dataset (src/data/products.js).
 *
 * Behavior:
 *  - If Supabase isn't configured (no VITE_SUPABASE_URL/ANON_KEY — the
 *    actual state of this dev environment, see src/lib/config/env.ts),
 *    fall back to the static dataset immediately, no network call, no
 *    error shown to the user.
 *  - If Supabase IS configured but the request fails (network error,
 *    misconfigured project, etc.) or returns zero published products (a
 *    brand-new project with nothing published yet), fall back to the
 *    static dataset as well, but keep the specific error message around in
 *    case a page wants to surface a subtle "showing sample products" note.
 *  - Never throws into the component tree and never leaves the storefront
 *    on an infinite spinner — every path resolves `loading: false`.
 *
 * This intentionally loads the full published product list once and
 * derives everything else (by slug, by category, "others") in memory —
 * the catalog is small, and it keeps every page's data story identical
 * (same loading/empty/error affordances) without a matrix of specialized
 * hooks per query.
 */
import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { listPublishedProducts } from '../repositories/products.repository'
import { adaptProduct } from '../data/catalogAdapter'
import { products as fallbackProducts } from '../data/products'
import { applyProductEdits, useSiteContent } from '../lib/siteContent'

/**
 * @returns {{ products: object[], loading: boolean, error: string|null, source: 'supabase'|'fallback' }}
 */
export function useProducts() {
  const content = useSiteContent()
  const [state, setState] = useState({ products: [], loading: true, error: null, source: 'fallback' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!isSupabaseConfigured()) {
        if (!cancelled) setState({ products: fallbackProducts, loading: false, error: null, source: 'fallback' })
        return
      }
      try {
        const rows = await listPublishedProducts()
        if (cancelled) return
        if (rows.length === 0) {
          setState({ products: fallbackProducts, loading: false, error: null, source: 'fallback' })
          return
        }
        setState({ products: rows.map(adaptProduct), loading: false, error: null, source: 'supabase' })
      } catch (err) {
        if (cancelled) return
        setState({
          products: fallbackProducts,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load products from Supabase.',
          source: 'fallback',
        })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const products = useMemo(() => applyProductEdits(state.products, content), [state.products, content])
  return { ...state, products }
}

/**
 * A single product by slug, derived from the same loaded list useProducts()
 * uses (see file header for why). `notFound` is only meaningful once
 * `loading` is false.
 * @param {string|undefined} slug
 */
export function useProduct(slug) {
  const { products, loading, error, source } = useProducts()
  const product = products.find((p) => p.slug === slug) ?? null
  return { product, others: products.filter((p) => p.slug !== slug), loading, error, notFound: !loading && !product, source }
}
