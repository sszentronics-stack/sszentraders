/**
 * Product administration service — the write path for products, variants,
 * and images. Every function here is called ONLY from the `products` Edge
 * Function (supabase/functions/products/index.ts) using the service-role
 * Supabase client, after that function has already verified the caller is
 * an admin (profiles.is_admin — see supabase/migrations/0014_row_level_security.sql).
 * Nothing here performs its own authorization check; callers must.
 *
 * Design notes:
 *  - Validation happens BEFORE any database call, via the Zod schemas in
 *    backend/lib/validation. Draft-safety (publish readiness) and discount/
 *    badge math are pure functions from backend/lib/catalog, unit tested
 *    independently of any database.
 *  - Slug/SKU uniqueness is enforced at the database level (unique
 *    indexes). We still generate a clean candidate slug up front
 *    (backend/lib/slug) for a good default, but the source of truth for
 *    "is this taken" is the database: a unique-violation (Postgres code
 *    23505) is caught and re-thrown as a clean ConflictError rather than a
 *    raw Postgres error leaking to the client.
 *  - No function here deletes a `products` row. Archiving only flips
 *    `status`/`archived_at`; historical order_items snapshot product name/
 *    price/sku directly (Phase 1), so archiving never breaks past orders.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assessPublishReadiness } from '../../lib/catalog'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors'
import {
  buildProductImageStoragePath,
  validateImageUpload,
  type ImageUploadCandidate,
} from '../../lib/media'
import { generateUniqueSlug } from '../../lib/slug'
import type {
  CreateProductInput,
  ProductImageInput,
  ReorderImagesInput,
  UpdateProductInput,
  UpdateVariantInput,
} from '../../lib/validation'

const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === UNIQUE_VIOLATION)
}

/** Generate a unique product slug, preferring the admin-supplied one if given and free. */
async function resolveProductSlug(db: SupabaseClient, name: string, requestedSlug?: string): Promise<string> {
  const seed = requestedSlug ?? name
  return generateUniqueSlug(seed, async (candidate) => {
    const { data } = await db.from('products').select('id').eq('slug', candidate).maybeSingle()
    return Boolean(data)
  })
}

export async function createProduct(db: SupabaseClient, input: CreateProductInput): Promise<{ productId: string; slug: string }> {
  const slug = await resolveProductSlug(db, input.name, input.slug)

  const { data: product, error: productError } = await db
    .from('products')
    .insert({
      brand_id: input.brandId ?? null,
      name: input.name,
      slug,
      short_description: input.shortDescription ?? null,
      description: input.description ?? null,
      ingredients: input.ingredients ?? null,
      directions: input.directions ?? null,
      product_type: input.productType ?? null,
      seo_title: input.seoTitle ?? null,
      seo_description: input.seoDescription ?? null,
      is_featured: input.isFeatured,
      attributes: input.attributes ?? {},
      status: 'draft', // creation always starts as draft; use setProductStatus to publish once variants/images exist.
    })
    .select('id')
    .single()

  if (productError) {
    if (isUniqueViolation(productError)) throw new ConflictError(`Slug "${slug}" is already in use.`)
    throw productError
  }

  const variantsPayload = input.variants.map((variant) => ({
    product_id: product.id,
    sku: variant.sku,
    barcode: variant.barcode ?? null,
    title: variant.title ?? null,
    price: variant.price,
    compare_at_price: variant.compareAtPrice ?? null,
    currency: variant.currency,
    weight: variant.weight ?? null,
    weight_unit: variant.weightUnit ?? 'g',
    attributes: variant.attributes,
    status: variant.status,
  }))
  const { error: variantsError } = await db.from('product_variants').insert(variantsPayload)
  if (variantsError) {
    if (isUniqueViolation(variantsError)) throw new ConflictError('One or more SKUs are already in use.')
    throw variantsError
  }

  if (input.categoryIds.length > 0) {
    const { error: categoriesError } = await db
      .from('product_categories')
      .insert(input.categoryIds.map((categoryId) => ({ product_id: product.id, category_id: categoryId })))
    if (categoriesError) throw categoriesError
  }

  if (input.collectionIds.length > 0) {
    const { error: collectionsError } = await db
      .from('product_collections')
      .insert(input.collectionIds.map((collectionId) => ({ product_id: product.id, collection_id: collectionId })))
    if (collectionsError) throw collectionsError
  }

  return { productId: product.id as string, slug }
}

export async function updateProduct(db: SupabaseClient, productId: string, input: UpdateProductInput): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.brandId !== undefined) patch.brand_id = input.brandId
  if (input.name !== undefined) patch.name = input.name
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription
  if (input.description !== undefined) patch.description = input.description
  if (input.ingredients !== undefined) patch.ingredients = input.ingredients
  if (input.directions !== undefined) patch.directions = input.directions
  if (input.productType !== undefined) patch.product_type = input.productType
  if (input.seoTitle !== undefined) patch.seo_title = input.seoTitle
  if (input.seoDescription !== undefined) patch.seo_description = input.seoDescription
  if (input.isFeatured !== undefined) patch.is_featured = input.isFeatured
  if (input.attributes !== undefined) patch.attributes = input.attributes

  if (input.slug !== undefined) {
    patch.slug = await resolveProductSlug(db, input.name ?? '', input.slug)
  }

  if (Object.keys(patch).length === 0 && !input.categoryIds && !input.collectionIds) return

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from('products').update(patch).eq('id', productId)
    if (error) {
      if (isUniqueViolation(error)) throw new ConflictError(`Slug "${patch.slug}" is already in use.`)
      throw error
    }
  }

  if (input.categoryIds !== undefined) {
    await db.from('product_categories').delete().eq('product_id', productId)
    if (input.categoryIds.length > 0) {
      await db
        .from('product_categories')
        .insert(input.categoryIds.map((categoryId) => ({ product_id: productId, category_id: categoryId })))
    }
  }

  if (input.collectionIds !== undefined) {
    await db.from('product_collections').delete().eq('product_id', productId)
    if (input.collectionIds.length > 0) {
      await db
        .from('product_collections')
        .insert(input.collectionIds.map((collectionId) => ({ product_id: productId, collection_id: collectionId })))
    }
  }
}

/**
 * Transition a product's status. Moving TO `published` is gated by
 * assessPublishReadiness (must have >=1 published variant and >=1 image) —
 * this is the "draft safety" the spec asks for, preventing an empty or
 * half-configured product from going live by accident.
 */
export async function setProductStatus(
  db: SupabaseClient,
  productId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<void> {
  if (status === 'published') {
    const [{ count: variantCount }, { count: publishedVariantCount }, { count: imageCount }] = await Promise.all([
      db.from('product_variants').select('id', { count: 'exact', head: true }).eq('product_id', productId),
      db
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('status', 'published'),
      db.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    ])

    const readiness = assessPublishReadiness({
      variantCount: variantCount ?? 0,
      publishedVariantCount: publishedVariantCount ?? 0,
      imageCount: imageCount ?? 0,
    })
    if (!readiness.ready) {
      throw new ValidationError('Product is not ready to publish.', readiness.reasons.map((message) => ({ path: 'status', message })))
    }
  }

  const patch: Record<string, unknown> = { status }
  if (status === 'published') patch.published_at = new Date().toISOString()
  if (status === 'archived') patch.archived_at = new Date().toISOString()

  const { error, count } = await db.from('products').update(patch, { count: 'exact' }).eq('id', productId)
  if (error) throw error
  if (!count) throw new NotFoundError('Product')
}

export async function archiveProduct(db: SupabaseClient, productId: string): Promise<void> {
  await setProductStatus(db, productId, 'archived')
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export async function addVariant(
  db: SupabaseClient,
  productId: string,
  input: { sku: string; barcode?: string; title?: string; price: number; compareAtPrice?: number; currency: string; weight?: number; weightUnit?: string; attributes: Record<string, unknown>; status: 'draft' | 'published' | 'archived' },
): Promise<{ variantId: string }> {
  const { data, error } = await db
    .from('product_variants')
    .insert({
      product_id: productId,
      sku: input.sku,
      barcode: input.barcode ?? null,
      title: input.title ?? null,
      price: input.price,
      compare_at_price: input.compareAtPrice ?? null,
      currency: input.currency,
      weight: input.weight ?? null,
      weight_unit: input.weightUnit ?? 'g',
      attributes: input.attributes,
      status: input.status,
    })
    .select('id')
    .single()

  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`SKU "${input.sku}" is already in use.`)
    throw error
  }
  return { variantId: data.id as string }
}

export async function updateVariant(db: SupabaseClient, variantId: string, input: UpdateVariantInput): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.sku !== undefined) patch.sku = input.sku
  if (input.barcode !== undefined) patch.barcode = input.barcode
  if (input.title !== undefined) patch.title = input.title
  if (input.price !== undefined) patch.price = input.price
  if (input.compareAtPrice !== undefined) patch.compare_at_price = input.compareAtPrice
  if (input.currency !== undefined) patch.currency = input.currency
  if (input.weight !== undefined) patch.weight = input.weight
  if (input.weightUnit !== undefined) patch.weight_unit = input.weightUnit
  if (input.attributes !== undefined) patch.attributes = input.attributes
  if (input.status !== undefined) patch.status = input.status

  if (Object.keys(patch).length === 0) return

  const { error } = await db.from('product_variants').update(patch).eq('id', variantId)
  if (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`SKU "${input.sku}" is already in use.`)
    throw error
  }
}

export async function archiveVariant(db: SupabaseClient, variantId: string): Promise<void> {
  const { error } = await db
    .from('product_variants')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', variantId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const PRODUCT_IMAGES_BUCKET = 'product-images'

/**
 * Issue a signed upload URL for a new product image after validating
 * MIME/size and sanitizing the path. This is the "image upload
 * authorization" server-only logic called out in the Phase 3 spec — the
 * browser never gets write access to the bucket directly; it always goes
 * through this admin-checked endpoint to obtain a short-lived signed URL.
 */
export async function createProductImageUploadUrl(
  db: SupabaseClient,
  params: { productId: string; variantId?: string | null; candidate: ImageUploadCandidate },
): Promise<{ path: string; signedUrl: string; token: string }> {
  const mimeType = validateImageUpload(params.candidate)
  const imageId = crypto.randomUUID()
  const path = buildProductImageStoragePath({
    productId: params.productId,
    variantId: params.variantId ?? null,
    imageId,
    mimeType,
  })

  const { data, error } = await db.storage.from(PRODUCT_IMAGES_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw error ?? new Error('Failed to create signed upload URL.')

  return { path: data.path, signedUrl: data.signedUrl, token: data.token }
}

/**
 * Record image metadata after the admin has uploaded the file to the
 * signed URL. Enforces "one primary image per product" by unsetting any
 * existing primary first — best-effort (not a single DB transaction, since
 * this runs over the JS client rather than a Postgres function), documented
 * as a known limitation in docs/phase-3-completion-report.md.
 */
export async function addProductImage(db: SupabaseClient, productId: string, input: ProductImageInput): Promise<{ imageId: string }> {
  if (input.isPrimary && !input.variantId) {
    await db.from('product_images').update({ is_primary: false }).eq('product_id', productId).is('variant_id', null)
  }

  const { data, error } = await db
    .from('product_images')
    .insert({
      product_id: productId,
      variant_id: input.variantId ?? null,
      storage_path: input.storagePath,
      alt_text: input.altText ?? null,
      sort_order: input.sortOrder,
      is_primary: input.isPrimary,
    })
    .select('id')
    .single()

  if (error) throw error
  return { imageId: data.id as string }
}

export async function reorderProductImages(db: SupabaseClient, productId: string, input: ReorderImagesInput): Promise<void> {
  for (const item of input.order) {
    const { error } = await db
      .from('product_images')
      .update({ sort_order: item.sortOrder })
      .eq('id', item.id)
      .eq('product_id', productId)
    if (error) throw error
  }
}

export async function setPrimaryProductImage(db: SupabaseClient, productId: string, imageId: string): Promise<void> {
  await db.from('product_images').update({ is_primary: false }).eq('product_id', productId).is('variant_id', null)
  const { error } = await db.from('product_images').update({ is_primary: true }).eq('id', imageId).eq('product_id', productId)
  if (error) throw error
}

/**
 * Remove an image's metadata row and best-effort delete the underlying
 * storage object. Never deletes an object still referenced by another
 * `product_images` row (e.g. the same file reused across variants is not
 * currently supported — each row owns a distinct storage_path per the
 * bucket convention — so this is safe as written; see the storage cleanup
 * strategy note in the completion report for the fuller orphan-prevention
 * story once a live project exists to run a periodic reconciliation job
 * against).
 */
export async function removeProductImage(db: SupabaseClient, imageId: string): Promise<void> {
  const { data: image, error: fetchError } = await db
    .from('product_images')
    .select('id, storage_path')
    .eq('id', imageId)
    .maybeSingle()
  if (fetchError) throw fetchError
  if (!image) throw new NotFoundError('Product image')

  const { error: deleteError } = await db.from('product_images').delete().eq('id', imageId)
  if (deleteError) throw deleteError

  // Best-effort: don't fail the whole operation if the storage object was
  // already gone or the bucket call errors — the metadata row (the source
  // of truth for what the storefront shows) is already removed.
  await db.storage.from(PRODUCT_IMAGES_BUCKET).remove([image.storage_path as string]).catch(() => undefined)
}
