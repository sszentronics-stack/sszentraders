/**
 * Thin data-access wrapper around Supabase for published collection reads
 * (time-boxed campaigns — see supabase/migrations/0004_catalog_brands_categories_collections.sql).
 * See products.repository.ts for the shared "field-scoped select, RLS is
 * the real gate" security note.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import type { Collection } from '../../backend/lib/types/domain'

interface CollectionRow {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  status: 'draft' | 'published' | 'archived'
  starts_at: string | null
  ends_at: string | null
}

function mapCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.image_url,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }
}

const COLLECTION_SELECT = 'id, name, slug, description, image_url, status, starts_at, ends_at'

/** Published collections whose campaign window (if any) is currently active. */
export async function listActiveCollections(now: Date = new Date()): Promise<Collection[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('collections')
    .select(COLLECTION_SELECT)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to list collections: ${error.message}`)
  const nowIso = now.toISOString()
  return ((data ?? []) as CollectionRow[])
    .filter((row) => (!row.starts_at || row.starts_at <= nowIso) && (!row.ends_at || row.ends_at >= nowIso))
    .map(mapCollection)
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('collections')
    .select(COLLECTION_SELECT)
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Failed to load collection "${slug}": ${error.message}`)
  return data ? mapCollection(data as CollectionRow) : null
}
