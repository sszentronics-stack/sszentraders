/**
 * Phase 16 — lightweight per-page SEO. No react-helmet dependency (none
 * exists in package.json and this app has no server-side rendering, so a
 * heavier head-management library buys nothing here); a plain useEffect
 * that writes document.title + a handful of <meta>/<link> tags and cleans
 * up on unmount/re-run is sufficient for a client-rendered SPA and keeps
 * the bundle small.
 *
 * Usage: useSeo({ title, description, image?, noindex? }) in a page
 * component. `title` is used as-is (callers should already include the
 * "SSzentronics" suffix where appropriate, matching index.html's
 * default <title>).
 */
import { useEffect } from 'react'

function setMetaTag(attr, key, content) {
  if (!content) return () => {}
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  const existed = Boolean(el)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  const previous = el.getAttribute('content')
  el.setAttribute('content', content)
  return () => {
    if (!existed) {
      el.remove()
    } else if (previous != null) {
      el.setAttribute('content', previous)
    }
  }
}

function setCanonical(href) {
  if (!href) return () => {}
  let el = document.head.querySelector('link[rel="canonical"]')
  const existed = Boolean(el)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  const previous = el.getAttribute('href')
  el.setAttribute('href', href)
  return () => {
    if (!existed) el.remove()
    else if (previous != null) el.setAttribute('href', previous)
  }
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {string} [opts.image] absolute or root-relative OG image URL
 * @param {boolean} [opts.noindex] adds a robots noindex tag (account pages, admin, checkout)
 */
export function useSeo({ title, description, image, noindex } = {}) {
  useEffect(() => {
    const previousTitle = document.title
    if (title) document.title = title

    const cleanups = [
      setMetaTag('name', 'description', description),
      setMetaTag('property', 'og:title', title),
      setMetaTag('property', 'og:description', description),
      setMetaTag('property', 'og:image', image),
      setMetaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
      setMetaTag('name', 'robots', noindex ? 'noindex, nofollow' : undefined),
      setCanonical(typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined),
    ]

    return () => {
      document.title = previousTitle
      cleanups.forEach((undo) => undo())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, noindex])
}

/** Injects a JSON-LD <script type="application/ld+json"> block, removed on unmount/change. */
export function useJsonLd(data) {
  useEffect(() => {
    if (!data) return undefined
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(data)
    document.head.appendChild(script)
    return () => script.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data)])
}
