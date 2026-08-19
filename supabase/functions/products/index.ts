/**
 * products — maps to backend/services/products + backend/services/catalog.
 * Public reads (published products/brands/categories/collections) go
 * DIRECTLY from the Vite frontend to Supabase via the anon key + RLS (see
 * src/repositories/products.repository.ts) — they do not need this
 * function. This Edge Function exists for the privileged write path:
 * creating/updating a product as an admin, which must never be reachable
 * with just the anon key.
 *
 * Phase 1 ships the admin-authorization + validation + audit-log wiring;
 * a real admin UI (Phase 12) is out of scope here.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { getSupabaseAdminClient, getSupabaseUserScopedClient } from '../_shared/supabaseAdmin.ts'
import { AuthenticationError, AuthorizationError } from '../../../backend/lib/errors/index.ts'
import { createProductSchema, parseOrThrow } from '../../../backend/lib/validation/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    if (req.method !== 'POST') {
      return okResponse({ message: 'products function supports POST (admin create) only in Phase 1.' })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new AuthenticationError('Missing Authorization header.')

    const userScoped = getSupabaseUserScopedClient(authHeader)
    const {
      data: { user },
    } = await userScoped.auth.getUser()
    if (!user) throw new AuthenticationError('Invalid or expired session.')

    const admin = getSupabaseAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, is_admin')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!profile?.is_admin) throw new AuthorizationError('Only admins can create products.')

    const body = await req.json().catch(() => ({}))
    const input = parseOrThrow(createProductSchema, body)

    const { data: product, error: productError } = await admin
      .from('products')
      .insert({
        brand_id: input.brandId ?? null,
        name: input.name,
        slug: input.slug,
        short_description: input.shortDescription ?? null,
        description: input.description ?? null,
        status: input.status,
      })
      .select('id')
      .single()
    if (productError) throw productError

    const variantsPayload = input.variants.map((variant) => ({
      product_id: product.id,
      sku: variant.sku,
      title: variant.title ?? null,
      price: variant.price,
      compare_at_price: variant.compareAtPrice ?? null,
      currency: variant.currency,
      attributes: variant.attributes,
    }))
    const { error: variantsError } = await admin.from('product_variants').insert(variantsPayload)
    if (variantsError) throw variantsError

    if (input.categoryIds.length > 0) {
      const { error: categoriesError } = await admin
        .from('product_categories')
        .insert(input.categoryIds.map((categoryId) => ({ product_id: product.id, category_id: categoryId })))
      if (categoriesError) throw categoriesError
    }

    await writeAuditLog(admin, {
      actor: profile.id,
      actorType: 'admin',
      action: 'admin.product_created',
      entityType: 'product',
      entityId: product.id,
      metadata: { slug: input.slug, variantCount: input.variants.length },
    })

    return okResponse({ productId: product.id }, 201)
  }),
)
