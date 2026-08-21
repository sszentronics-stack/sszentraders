/**
 * Slug generation — single authoritative implementation shared by every
 * catalog entity (brands, categories, collections, products). Actual
 * uniqueness is enforced at the database level (unique index on `slug` in
 * each table, see supabase/migrations/0004_* and 0005_*); this module only
 * produces a clean, stable, URL-safe candidate and a deterministic sequence
 * of fallback candidates ("sadoer-mask", "sadoer-mask-2", ...) for callers
 * to try until the database accepts one.
 */

const COMBINING_DIACRITICS = /[̀-ͯ]/g

/** Turn arbitrary human text into a URL-safe, lowercase, hyphenated slug. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '') // strip accents after NFKD decomposition
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export class EmptySlugError extends Error {
  constructor(input: string) {
    super(`Could not derive a non-empty slug from "${input}"`)
    this.name = 'EmptySlugError'
  }
}

/** slugify() that throws rather than silently returning an empty string (e.g. input was all emoji/punctuation). */
export function slugifyStrict(input: string): string {
  const slug = slugify(input)
  if (!slug) throw new EmptySlugError(input)
  return slug
}

/** Deterministic fallback candidate for the Nth retry after a slug collision: base, base-2, base-3, ... */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base
  return `${base}-${attempt}`
}

const MAX_SLUG_ATTEMPTS = 50

export class SlugExhaustedError extends Error {
  constructor(base: string, attempts: number) {
    super(`Could not find a unique slug based on "${base}" after ${attempts} attempts`)
    this.name = 'SlugExhaustedError'
  }
}

/**
 * Generate a unique slug by calling `exists(candidate)` for each candidate
 * until one comes back false. Runtime-agnostic — callers pass in whatever
 * "does this slug already exist" check makes sense for their storage
 * (a Supabase query, an in-memory Set in tests, etc).
 */
export async function generateUniqueSlug(
  seed: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyStrict(seed)
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = slugCandidate(base, attempt)
    if (!(await exists(candidate))) return candidate
  }
  throw new SlugExhaustedError(base, MAX_SLUG_ATTEMPTS)
}
