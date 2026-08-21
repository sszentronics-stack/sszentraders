/**
 * catalog — admin write path for brands, hierarchical categories, and
 * time-boxed collections (Phase 3). Mirrors supabase/functions/products/
 * index.ts's shape and conventions (see that file's header for the
 * rationale on manual routing). Public reads of published brands/
 * categories/collections go directly from the frontend via
 * src/repositories/{brands,categories,collections}.repository.ts + RLS —
 * this function is writes only.
 *
 *   POST   /brands                create
 *   PATCH  /brands/:id            update
 *   POST   /brands/:id/:action    action = publish | unpublish | archive
 *   (same shape for /categories and /collections)
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError } from '../../../backend/lib/errors/index.ts'
import {
  brandInputSchema,
  updateBrandInputSchema,
  categoryInputSchema,
  updateCategoryInputSchema,
  collectionInputSchema,
  updateCollectionInputSchema,
  parseOrThrow,
} from '../../../backend/lib/validation/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'
import * as catalog from '../../../backend/services/catalog/catalog.service.ts'

const ACTIONS = { publish: 'published', unpublish: 'draft', archive: 'archived' } as const

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?catalog\/?/, '').split('/').filter(Boolean)
    const [entity, id, action] = segments
    const admin = getSupabaseAdminClient()
    const body = await req.json().catch(() => ({}))

    if (!entity || !['brands', 'categories', 'collections'].includes(entity)) {
      throw new NotFoundError('Route')
    }

    // POST /:entity — create
    if (req.method === 'POST' && !id) {
      const caller = await requireAdmin(req)
      if (entity === 'brands') {
        const input = parseOrThrow(brandInputSchema, body)
        const result = await catalog.createBrand(admin, input)
        await audit(admin, caller.profileId, 'brand_created', 'brand', result.brandId, { slug: result.slug })
        return okResponse(result, 201)
      }
      if (entity === 'categories') {
        const input = parseOrThrow(categoryInputSchema, body)
        const result = await catalog.createCategory(admin, input)
        await audit(admin, caller.profileId, 'category_created', 'category', result.categoryId, { slug: result.slug })
        return okResponse(result, 201)
      }
      const input = parseOrThrow(collectionInputSchema, body)
      const result = await catalog.createCollection(admin, input)
      await audit(admin, caller.profileId, 'collection_created', 'collection', result.collectionId, { slug: result.slug })
      return okResponse(result, 201)
    }

    if (!id) throw new NotFoundError('Route')

    // PATCH /:entity/:id — update
    if (req.method === 'PATCH' && !action) {
      const caller = await requireAdmin(req)
      if (entity === 'brands') {
        await catalog.updateBrand(admin, id, parseOrThrow(updateBrandInputSchema, body))
      } else if (entity === 'categories') {
        await catalog.updateCategory(admin, id, parseOrThrow(updateCategoryInputSchema, body))
      } else {
        await catalog.updateCollection(admin, id, parseOrThrow(updateCollectionInputSchema, body))
      }
      await audit(admin, caller.profileId, `${singular(entity)}_updated`, singular(entity), id)
      return okResponse({ id })
    }

    // POST /:entity/:id/:action — publish | unpublish | archive
    if (req.method === 'POST' && action && action in ACTIONS) {
      const caller = await requireAdmin(req)
      const status = ACTIONS[action as keyof typeof ACTIONS]
      if (entity === 'brands') await catalog.setBrandStatus(admin, id, status)
      else if (entity === 'categories') await catalog.setCategoryStatus(admin, id, status)
      else await catalog.setCollectionStatus(admin, id, status)
      await audit(admin, caller.profileId, `${singular(entity)}_${action}`, singular(entity), id)
      return okResponse({ id, status })
    }

    throw new NotFoundError('Route')
  }),
)

function singular(entity: string): string {
  return entity.endsWith('ies') ? `${entity.slice(0, -3)}y` : entity.slice(0, -1)
}

async function audit(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await writeAuditLog(admin, { actor, actorType: 'admin', action: `admin.${action}`, entityType, entityId, metadata })
}
