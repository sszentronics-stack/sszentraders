/**
 * Public Storage URL helper for catalog images. Buckets are public-read
 * (supabase/migrations/0015_storage_buckets.sql) — this only builds the
 * public URL for a stored object's path, it never requests a signed URL
 * (signed upload URLs are an admin-only, server-issued concern — see
 * backend/services/products/products.service.ts createProductImageUploadUrl).
 */
import { getSupabaseBrowserClient } from './client'

export type CatalogBucket = 'product-images' | 'brand-assets' | 'category-assets'

/** Public URL for a stored catalog image, or null if `storagePath` is empty. */
export function getPublicImageUrl(bucket: CatalogBucket, storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const client = getSupabaseBrowserClient()
  return client.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl
}
