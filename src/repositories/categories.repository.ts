/**
 * Thin data-access wrapper around Supabase for published category reads.
 * See products.repository.ts for the "not wired into UI yet" note.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import type { Category } from '../../backend/lib/types/domain'

interface CategoryRow {
  id: string
  parent_id: string | null
  name: string
  slug: string
  status: 'draft' | 'published' | 'archived'
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
  }
}

export async function listPublishedCategories(): Promise<Category[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('categories')
    .select('id, parent_id, name, slug, status')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to list categories: ${error.message}`)
  return ((data ?? []) as CategoryRow[]).map(mapCategory)
}
