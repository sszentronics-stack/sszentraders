/**
 * products — admin product/variant/image write path (Phase 3: Product
 * Management & Dynamic Product Display Engine).
 *
 * Public reads (published products/brands/categories/collections) go
 * DIRECTLY from the Vite frontend to Supabase via the anon key + RLS (see
 * src/repositories/*.repository.ts) — they never touch this function. This
 * function exists ONLY for privileged writes: create/update/publish/
 * unpublish/archive a product, manage its variants/SKUs, and manage its
 * image gallery (including issuing signed upload URLs). Every request must
 * carry a caller JWT that resolves to an admin profile (see
 * ../_shared/adminAuth.ts) — there is no anon-key write path.
 *
 * Routing is a minimal manual switch on `${method} ${pathname}` (relative
 * to the function root) rather than a framework — this project has no
 * server dependency to route with (Deno Edge Functions, no Express/Hono),
 * and the route table is small enough that a switch stays readable:
 *
 *   POST   /                                create product (+ variants)
 *   PATCH  /:id                             update product fields
 *   POST   /:id/publish                     publish (draft-safety gated)
 *   POST   /:id/unpublish                   back to draft
 *   POST   /:id/archive                     archive (soft; keeps history)
 *   POST   /:id/variants                    add a variant/SKU
 *   PATCH  /:id/variants/:variantId         update a variant/SKU
 *   POST   /:id/variants/:variantId/archive archive a variant/SKU
 *   POST   /:id/images/upload-url           get a signed upload URL
 *   POST   /:id/images                      record uploaded image metadata
 *   PATCH  /:id/images/reorder              bulk-update sort_order
 *   POST   /:id/images/:imageId/primary     set the primary image
 *   DELETE /:id/images/:imageId             remove an image
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError } from '../../../backend/lib/errors/index.ts'
import {
  createProductSchema,
  updateProductSchema,
  productVariantInputSchema,
  updateVariantSchema,
  productImageInputSchema,
  reorderImagesSchema,
  imageUploadRequestSchema,
  parseOrThrow,
} from '../../../backend/lib/validation/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'
import * as products from '../../../backend/services/products/products.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    // Supabase invokes this as /functions/v1/products/<rest>; strip the
    // function name so routing below only deals with the part after it.
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?products\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const body = await req.json().catch(() => ({}))

    // POST / — create
    if (req.method === 'POST' && segments.length === 0) {
      const caller = await requireAdmin(req)
      const input = parseOrThrow(createProductSchema, body)
      const result = await products.createProduct(admin, input)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.product_created',
        entityType: 'product',
        entityId: result.productId,
        metadata: { slug: result.slug, variantCount: input.variants.length },
      })
      return okResponse(result, 201)
    }

    const [productId, ...rest] = segments
    if (!productId) throw new NotFoundError('Route')

    // PATCH /:id — update
    if (req.method === 'PATCH' && rest.length === 0) {
      const caller = await requireAdmin(req)
      const input = parseOrThrow(updateProductSchema, body)
      await products.updateProduct(admin, productId, input)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.product_updated',
        entityType: 'product',
        entityId: productId,
      })
      return okResponse({ productId })
    }

    // POST /:id/publish | /:id/unpublish | /:id/archive
    if (req.method === 'POST' && rest.length === 1 && ['publish', 'unpublish', 'archive'].includes(rest[0])) {
      const caller = await requireAdmin(req)
      const status = rest[0] === 'publish' ? 'published' : rest[0] === 'unpublish' ? 'draft' : 'archived'
      await products.setProductStatus(admin, productId, status)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: `admin.product_${rest[0]}`,
        entityType: 'product',
        entityId: productId,
      })
      return okResponse({ productId, status })
    }

    // POST /:id/variants — add
    if (req.method === 'POST' && rest.length === 1 && rest[0] === 'variants') {
      const caller = await requireAdmin(req)
      const input = parseOrThrow(productVariantInputSchema, body)
      const result = await products.addVariant(admin, productId, input)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.variant_created',
        entityType: 'product_variant',
        entityId: result.variantId,
        metadata: { productId, sku: input.sku },
      })
      return okResponse(result, 201)
    }

    // PATCH /:id/variants/:variantId — update
    if (req.method === 'PATCH' && rest.length === 2 && rest[0] === 'variants') {
      const caller = await requireAdmin(req)
      const variantId = rest[1]
      const input = parseOrThrow(updateVariantSchema, body)
      await products.updateVariant(admin, variantId, input)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.variant_updated',
        entityType: 'product_variant',
        entityId: variantId,
      })
      return okResponse({ variantId })
    }

    // POST /:id/variants/:variantId/archive
    if (req.method === 'POST' && rest.length === 3 && rest[0] === 'variants' && rest[2] === 'archive') {
      const caller = await requireAdmin(req)
      const variantId = rest[1]
      await products.archiveVariant(admin, variantId)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.variant_archived',
        entityType: 'product_variant',
        entityId: variantId,
      })
      return okResponse({ variantId })
    }

    // POST /:id/images/upload-url — signed upload URL (image upload authorization)
    if (req.method === 'POST' && rest.length === 2 && rest[0] === 'images' && rest[1] === 'upload-url') {
      await requireAdmin(req)
      const input = parseOrThrow(imageUploadRequestSchema, body)
      const result = await products.createProductImageUploadUrl(admin, {
        productId,
        variantId: input.variantId,
        candidate: { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
      })
      return okResponse(result, 201)
    }

    // POST /:id/images — record uploaded image metadata
    if (req.method === 'POST' && rest.length === 1 && rest[0] === 'images') {
      const caller = await requireAdmin(req)
      const input = parseOrThrow(productImageInputSchema, body)
      const result = await products.addProductImage(admin, productId, input)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.image_added',
        entityType: 'product_image',
        entityId: result.imageId,
        metadata: { productId },
      })
      return okResponse(result, 201)
    }

    // PATCH /:id/images/reorder
    if (req.method === 'PATCH' && rest.length === 2 && rest[0] === 'images' && rest[1] === 'reorder') {
      const caller = await requireAdmin(req)
      const input = parseOrThrow(reorderImagesSchema, body)
      await products.reorderProductImages(admin, productId, input)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.images_reordered',
        entityType: 'product',
        entityId: productId,
      })
      return okResponse({ productId })
    }

    // POST /:id/images/:imageId/primary
    if (req.method === 'POST' && rest.length === 3 && rest[0] === 'images' && rest[2] === 'primary') {
      const caller = await requireAdmin(req)
      const imageId = rest[1]
      await products.setPrimaryProductImage(admin, productId, imageId)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.image_set_primary',
        entityType: 'product_image',
        entityId: imageId,
      })
      return okResponse({ imageId })
    }

    // DELETE /:id/images/:imageId
    if (req.method === 'DELETE' && rest.length === 2 && rest[0] === 'images') {
      const caller = await requireAdmin(req)
      const imageId = rest[1]
      await products.removeProductImage(admin, imageId)
      await writeAuditLog(admin, {
        actor: caller.profileId,
        actorType: 'admin',
        action: 'admin.image_removed',
        entityType: 'product_image',
        entityId: imageId,
      })
      return okResponse({ imageId })
    }

    throw new NotFoundError('Route')
  }),
)
