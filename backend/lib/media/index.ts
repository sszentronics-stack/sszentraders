/**
 * Image upload validation + storage path rules shared by every catalog
 * image endpoint (product/variant galleries, brand logos, category
 * images). Pure/runtime-agnostic: no Supabase Storage calls happen here —
 * services import this to validate/sanitize before ever touching Storage,
 * so the same rules can be unit tested without a live bucket.
 *
 * Storage path convention (see supabase/migrations/0015_storage_buckets.sql):
 *   product-images/{product_id}/{variant_id-or-'default'}/{image_id}.{ext}
 * File paths must use stable IDs, never admin-typed file names — the
 * original file name is preserved only as `alt_text`/audit metadata, never
 * as part of the storage path, so a rename/re-upload can never collide with
 * or overwrite an unrelated object.
 */
import { ValidationError } from '../errors'

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number]

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

const MIME_TO_EXTENSION: Record<AllowedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

export interface ImageUploadCandidate {
  fileName: string
  mimeType: string
  sizeBytes: number
}

function isAllowedMimeType(mimeType: string): mimeType is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
}

/**
 * Validate an image upload request before issuing a signed upload URL or
 * accepting metadata for an already-uploaded object. Throws ValidationError
 * (never a bare Error) so Edge Functions can surface a clean 400.
 */
export function validateImageUpload(candidate: ImageUploadCandidate): AllowedImageMimeType {
  const issues: { path: string; message: string }[] = []

  if (!isAllowedMimeType(candidate.mimeType)) {
    issues.push({
      path: 'mimeType',
      message: `Unsupported image type "${candidate.mimeType}". Allowed: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`,
    })
  }
  if (!Number.isFinite(candidate.sizeBytes) || candidate.sizeBytes <= 0) {
    issues.push({ path: 'sizeBytes', message: 'sizeBytes must be a positive number.' })
  } else if (candidate.sizeBytes > MAX_IMAGE_BYTES) {
    issues.push({ path: 'sizeBytes', message: `Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit.` })
  }
  if (!candidate.fileName.trim()) {
    issues.push({ path: 'fileName', message: 'fileName is required.' })
  }

  if (issues.length > 0) throw new ValidationError('Image upload rejected', issues)
  return candidate.mimeType as AllowedImageMimeType
}

/**
 * Sanitize an admin-supplied file name for use in audit metadata / alt text
 * fallback only (NEVER for the storage path itself — see
 * buildProductImageStoragePath). Strips path separators and control
 * characters so a malicious/careless name like "../../etc/passwd.png" or
 * one containing NUL bytes can't do anything unexpected downstream.
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[\\/]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255)
}

/**
 * Deterministic, collision-proof storage path for a product (or
 * product-variant) image. Uses stable IDs only, per the bucket's
 * documented convention — never the admin's original file name.
 */
export function buildProductImageStoragePath(params: {
  productId: string
  variantId?: string | null
  imageId: string
  mimeType: AllowedImageMimeType
}): string {
  const variantSegment = params.variantId ?? 'default'
  const extension = MIME_TO_EXTENSION[params.mimeType]
  return `${params.productId}/${variantSegment}/${params.imageId}.${extension}`
}

export function buildBrandAssetStoragePath(params: { brandId: string; assetId: string; mimeType: AllowedImageMimeType }): string {
  return `${params.brandId}/${params.assetId}.${MIME_TO_EXTENSION[params.mimeType]}`
}

export function buildCategoryAssetStoragePath(params: { categoryId: string; assetId: string; mimeType: AllowedImageMimeType }): string {
  return `${params.categoryId}/${params.assetId}.${MIME_TO_EXTENSION[params.mimeType]}`
}

/** Phase 14 — review-images bucket (public read, see 0021_reviews_and_returns_workflow.sql). */
export function buildReviewImageStoragePath(params: { reviewId: string; imageId: string; mimeType: AllowedImageMimeType }): string {
  return `${params.reviewId}/${params.imageId}.${MIME_TO_EXTENSION[params.mimeType]}`
}

/**
 * Phase 14 — return-evidence bucket (PRIVATE, read only via a
 * service-role-issued signed URL — see 0021_reviews_and_returns_workflow.sql).
 * Keyed by orderItemId rather than the eventual return_item_id: evidence is
 * uploaded WHILE the customer is still assembling a return request, before
 * any `returns`/`return_items` row exists yet, so there is no return_item_id
 * to key on at upload time — the order item being returned already exists
 * and is what the caller owns/can prove.
 */
export function buildReturnEvidenceStoragePath(params: { orderItemId: string; evidenceId: string; mimeType: AllowedImageMimeType }): string {
  return `${params.orderItemId}/${params.evidenceId}.${MIME_TO_EXTENSION[params.mimeType]}`
}
