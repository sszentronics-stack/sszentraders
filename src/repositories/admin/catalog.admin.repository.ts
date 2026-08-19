/**
 * Admin brand/category/collection data access — reads via direct RLS-scoped
 * queries (admin bypasses the published-only filter the public
 * src/repositories/{brands,categories,collections}.repository.ts use, same
 * as products.admin.repository.ts), writes via the `catalog` Edge Function.
 */
import { getSupabaseBrowserClient } from '../../lib/supabase/client'
import { callEdgeFunction } from '../../lib/supabase/functions'
import type { Brand, Category, Collection } from '../../../backend/lib/types/domain'
import type { BrandInput, CategoryInput, CollectionInput } from '../../../backend/lib/validation/index'

type Entity = 'brands' | 'categories' | 'collections'

function mapBrand(row: any): Brand {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description, logoUrl: row.logo_url, status: row.status }
}
function mapCategory(row: any): Category {
  return { id: row.id, parentId: row.parent_id, name: row.name, slug: row.slug, status: row.status }
}
function mapCollection(row: any): Collection {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description, imageUrl: row.image_url, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at }
}

export async function listAllBrands(): Promise<Brand[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client.from('brands').select('id, name, slug, description, logo_url, status').order('sort_order', { ascending: true })
  if (error) throw new Error(`Failed to list brands: ${error.message}`)
  return ((data ?? []) as any[]).map(mapBrand)
}

export async function listAllCategories(): Promise<Category[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client.from('categories').select('id, parent_id, name, slug, status').order('sort_order', { ascending: true })
  if (error) throw new Error(`Failed to list categories: ${error.message}`)
  return ((data ?? []) as any[]).map(mapCategory)
}

export async function listAllCollections(): Promise<Collection[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client.from('collections').select('id, name, slug, description, image_url, status, starts_at, ends_at').order('sort_order', { ascending: true })
  if (error) throw new Error(`Failed to list collections: ${error.message}`)
  return ((data ?? []) as any[]).map(mapCollection)
}

export function createCatalogEntity(entity: Entity, input: BrandInput | CategoryInput | CollectionInput) {
  return callEdgeFunction<{ [key: string]: string }>(`catalog/${entity}`, { method: 'POST', body: input })
}

export function updateCatalogEntity(entity: Entity, id: string, input: Partial<BrandInput | CategoryInput | CollectionInput>) {
  return callEdgeFunction<{ id: string }>(`catalog/${entity}/${id}`, { method: 'PATCH', body: input })
}

export function setCatalogEntityStatus(entity: Entity, id: string, action: 'publish' | 'unpublish' | 'archive') {
  return callEdgeFunction<{ id: string; status: string }>(`catalog/${entity}/${id}/${action}`, { method: 'POST' })
}
