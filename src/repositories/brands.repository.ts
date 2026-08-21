/**
 * Thin data-access wrapper around Supabase for published brand reads.
 * See products.repository.ts for the "not wired into UI yet" note.
 */
import { getSupabaseBrowserClient } from '../lib/supabase/client'
import type { Brand } from '../../backend/lib/types/domain'

interface BrandRow {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  status: 'draft' | 'published' | 'archived'
}

function mapBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logo_url,
    status: row.status,
  }
}

export async function listPublishedBrands(): Promise<Brand[]> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('brands')
    .select('id, name, slug, description, logo_url, status')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Failed to list brands: ${error.message}`)
  return ((data ?? []) as BrandRow[]).map(mapBrand)
}
