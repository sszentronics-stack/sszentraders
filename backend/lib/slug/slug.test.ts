import { describe, expect, it } from 'vitest'
import { EmptySlugError, SlugExhaustedError, generateUniqueSlug, slugCandidate, slugify, slugifyStrict } from './index'

describe('slugify', () => {
  it('lowercases, hyphenates, and trims punctuation', () => {
    expect(slugify('SADOER Collagen Anti-Aging Facial Mask')).toBe('sadoer-collagen-anti-aging-facial-mask')
  })

  it('collapses repeated separators and strips leading/trailing hyphens', () => {
    expect(slugify('  Hero Mighty Patch --- Invisible+  ')).toBe('hero-mighty-patch-invisible')
  })

  it('returns an empty string for input with nothing sluggable', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('slugifyStrict', () => {
  it('throws EmptySlugError when nothing sluggable remains', () => {
    expect(() => slugifyStrict('★★★')).toThrow(EmptySlugError)
  })
})

describe('slugCandidate', () => {
  it('returns the base slug on the first attempt and suffixes afterwards', () => {
    expect(slugCandidate('sadoer-mask', 1)).toBe('sadoer-mask')
    expect(slugCandidate('sadoer-mask', 2)).toBe('sadoer-mask-2')
    expect(slugCandidate('sadoer-mask', 3)).toBe('sadoer-mask-3')
  })
})

describe('generateUniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const slug = await generateUniqueSlug('New Product', async () => false)
    expect(slug).toBe('new-product')
  })

  it('tries -2, -3, ... until a free candidate is found', async () => {
    const taken = new Set(['new-product', 'new-product-2'])
    const slug = await generateUniqueSlug('New Product', async (candidate) => taken.has(candidate))
    expect(slug).toBe('new-product-3')
  })

  it('throws SlugExhaustedError if every candidate up to the limit is taken', async () => {
    await expect(generateUniqueSlug('x', async () => true)).rejects.toBeInstanceOf(SlugExhaustedError)
  })
})
