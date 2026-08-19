/**
 * Brand / category / collection administration service — the write path
 * behind the `catalog` Edge Function (supabase/functions/catalog/index.ts).
 * Same conventions as backend/services/products/products.service.ts:
 * callers must already have verified admin authorization; slugs are
 * generated up front but the database's unique index is the real source of
 * truth (unique-violation -> ConflictError).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors'
import { generateUniqueSlug } from '../../lib/slug'
import type {
  BrandInput,
  CategoryInput,
  CollectionInput,
} from '../../lib/validation'

const UNIQUE_VIOLATION = '23505'
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === UNIQUE_VIOLATION)
}

async function resolveSlug(db: SupabaseClient, table: string, seed: string, requestedSlug?: string): Promise<string> {
  return generateUniqueSlug(requestedSlug ?? seed, async (candidate) => {
    const { data } = await db.from(table).select('id').eq('slug', candidate).maybeSingle()
    return Boolean(data)
  })
}

type ContentStatus = 'draft' | 'published' | 'archived'

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function createBrand(db: SupabaseClient, input: BrandInput): Promise<{ brandId: string; slug: string }> {
  const slug = await resolveSlug(db, 'brands', input.name, input.slug)
  const { data, error } = await db
    .from('brands')
    .insert({
      name: input.name,
      slug,
      description: input.description ?? null,
      logo_url: input.logoUrl ?? null,
      website_url: input.websiteUrl ?? null,
      status: input.status,
      sort_order: input.sortOrder,
    })
    .select('id')
    .single()
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`Slug "${slug}" is already in use.`)
    throw error
  }
  return { brandId: data.id as string, slug }
}

export async function updateBrand(db: SupabaseClient, brandId: string, input: Partial<BrandInput>): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl
  if (input.websiteUrl !== undefined) patch.website_url = input.websiteUrl
  if (input.status !== undefined) patch.status = input.status
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
  if (input.slug !== undefined) patch.slug = await resolveSlug(db, 'brands', input.name ?? '', input.slug)

  if (Object.keys(patch).length === 0) return
  const { error } = await db.from('brands').update(patch).eq('id', brandId)
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`Slug "${patch.slug}" is already in use.`)
    throw error
  }
}

export async function setBrandStatus(db: SupabaseClient, brandId: string, status: ContentStatus): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'archived') patch.archived_at = new Date().toISOString()
  const { error, count } = await db.from('brands').update(patch, { count: 'exact' }).eq('id', brandId)
  if (error) throw error
  if (!count) throw new NotFoundError('Brand')
}

// ---------------------------------------------------------------------------
// Categories (hierarchical: parent_id self-reference)
// ---------------------------------------------------------------------------

export async function createCategory(db: SupabaseClient, input: CategoryInput): Promise<{ categoryId: string; slug: string }> {
  const slug = await resolveSlug(db, 'categories', input.name, input.slug)
  const { data, error } = await db
    .from('categories')
    .insert({
      parent_id: input.parentId ?? null,
      name: input.name,
      slug,
      description: input.description ?? null,
      image_url: input.imageUrl ?? null,
      status: input.status,
      sort_order: input.sortOrder,
    })
    .select('id')
    .single()
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`Slug "${slug}" is already in use.`)
    throw error
  }
  return { categoryId: data.id as string, slug }
}

export async function updateCategory(db: SupabaseClient, categoryId: string, input: Partial<CategoryInput>): Promise<void> {
  if (input.parentId !== undefined && input.parentId === categoryId) {
    throw new ValidationError('A category cannot be its own parent.', [{ path: 'parentId', message: 'Cannot equal the category id.' }])
  }
  const patch: Record<string, unknown> = {}
  if (input.parentId !== undefined) patch.parent_id = input.parentId
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl
  if (input.status !== undefined) patch.status = input.status
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
  if (input.slug !== undefined) patch.slug = await resolveSlug(db, 'categories', input.name ?? '', input.slug)

  if (Object.keys(patch).length === 0) return
  const { error } = await db.from('categories').update(patch).eq('id', categoryId)
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`Slug "${patch.slug}" is already in use.`)
    throw error
  }
}

export async function setCategoryStatus(db: SupabaseClient, categoryId: string, status: ContentStatus): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'archived') patch.archived_at = new Date().toISOString()
  const { error, count } = await db.from('categories').update(patch, { count: 'exact' }).eq('id', categoryId)
  if (error) throw error
  if (!count) throw new NotFoundError('Category')
}

// ---------------------------------------------------------------------------
// Collections (time-boxed campaigns: starts_at/ends_at)
// ---------------------------------------------------------------------------

export async function createCollection(db: SupabaseClient, input: CollectionInput): Promise<{ collectionId: string; slug: string }> {
  const slug = await resolveSlug(db, 'collections', input.name, input.slug)
  const { data, error } = await db
    .from('collections')
    .insert({
      name: input.name,
      slug,
      description: input.description ?? null,
      image_url: input.imageUrl ?? null,
      status: input.status,
      sort_order: input.sortOrder,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
    })
    .select('id')
    .single()
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`Slug "${slug}" is already in use.`)
    throw error
  }
  return { collectionId: data.id as string, slug }
}

export async function updateCollection(db: SupabaseClient, collectionId: string, input: Partial<CollectionInput>): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl
  if (input.status !== undefined) patch.status = input.status
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt
  if (input.slug !== undefined) patch.slug = await resolveSlug(db, 'collections', input.name ?? '', input.slug)

  if (Object.keys(patch).length === 0) return
  const { error } = await db.from('collections').update(patch).eq('id', collectionId)
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`Slug "${patch.slug}" is already in use.`)
    throw error
  }
}

export async function setCollectionStatus(db: SupabaseClient, collectionId: string, status: ContentStatus): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (status === 'archived') patch.archived_at = new Date().toISOString()
  const { error, count } = await db.from('collections').update(patch, { count: 'exact' }).eq('id', collectionId)
  if (error) throw error
  if (!count) throw new NotFoundError('Collection')
}
