/**
 * promotions — Phase 13 (Promotions, Loyalty & Customer Intelligence).
 *
 * There is no Phase 1 stub for this function (0010_promotions.sql was
 * schema-only, no Edge Function) — this is a fresh function following the
 * same manual-router pattern established by ../products/index.ts and
 * ../cart/index.ts.
 *
 *   POST   /preview                          discount preview for the
 *                                              caller's own current cart
 *                                              {couponCode?} — never trusts
 *                                              a client cart, always
 *                                              re-reads it server-side
 *   GET    /loyalty                           caller's loyalty balance +
 *                                              history
 *   GET    /admin/campaigns                   list campaigns
 *   POST   /admin/campaigns                   create a campaign
 *   PATCH  /admin/campaigns/:id                update a campaign
 *   GET    /admin/promotions                  list promotions
 *   POST   /admin/promotions                  create a promotion
 *   PATCH  /admin/promotions/:id               update a promotion
 *   GET    /admin/coupons                     list coupons
 *   POST   /admin/coupons                     create a coupon
 *   PATCH  /admin/coupons/:id                  update/activate/deactivate a coupon
 *   GET    /admin/coupons/:id/usage            redemption count + audit trail
 *   GET    /admin/segments/:customerId         one customer's segment classification
 *   GET    /admin/abandoned-carts?days=N       abandoned-cart query (data only, no notification sent)
 *
 * Every /admin/* route requires an admin caller (../_shared/adminAuth.ts).
 * /preview and /loyalty require any caller (signed-in or anonymous-auth
 * guest, ../_shared/callerAuth.ts) and only ever operate on THAT caller's
 * own cart/customer record.
 */
import { withErrorHandling, okResponse } from '../_shared/http.ts'
import { requireCallerProfile } from '../_shared/callerAuth.ts'
import { requireAdmin } from '../_shared/adminAuth.ts'
import { getSupabaseAdminClient } from '../_shared/supabaseAdmin.ts'
import { NotFoundError } from '../../../backend/lib/errors/index.ts'
import {
  campaignInputSchema,
  couponInputSchema,
  discountPreviewSchema,
  parseOrThrow,
  promotionInputSchema,
  updateCampaignSchema,
  updateCouponSchema,
  updatePromotionSchema,
} from '../../../backend/lib/validation/index.ts'
import { writeAuditLog } from '../../../backend/lib/audit/index.ts'
import * as promotions from '../../../backend/services/promotions/promotions.service.ts'
import * as loyalty from '../../../backend/services/promotions/loyalty.service.ts'
import { classifyCustomer, listAbandonedCarts } from '../../../backend/services/promotions/segmentation.service.ts'
import { getCartSummary } from '../../../backend/services/cart/cart.service.ts'

Deno.serve(
  withErrorHandling(async (req) => {
    const url = new URL(req.url)
    const segments = url.pathname.replace(/^\/(functions\/v1\/)?promotions\/?/, '').split('/').filter(Boolean)
    const admin = getSupabaseAdminClient()
    const body = await req.json().catch(() => ({}))

    // POST /preview — cart-time discount preview for the caller's own cart.
    if (segments[0] === 'preview' && req.method === 'POST') {
      const caller = await requireCallerProfile(req)
      const input = parseOrThrow(discountPreviewSchema, body)
      const cart = await getCartSummary(admin, caller.id)
      const customerId = await loyalty.getCustomerIdForProfile(admin, caller.id)
      const preview = await promotions.previewDiscount(admin, {
        customerId,
        couponCode: input.couponCode,
        items: cart.items.map((i) => ({ productId: i.productId, lineTotal: i.lineTotal })),
      })
      const loyaltySummary = customerId ? await loyalty.getLoyaltySummaryForCustomer(admin, customerId) : null
      return okResponse({
        ...preview,
        cartSubtotal: cart.subtotal,
        loyaltyBalance: loyaltySummary?.balance ?? 0,
        maxRedeemablePoints: loyaltySummary?.maxRedeemableForSubtotal(cart.subtotal) ?? 0,
      })
    }

    // GET /loyalty — caller's own balance + history.
    if (segments[0] === 'loyalty' && req.method === 'GET') {
      const caller = await requireCallerProfile(req)
      const customerId = await loyalty.getCustomerIdForProfile(admin, caller.id)
      if (!customerId) return okResponse({ balance: 0, history: [] })
      const summary = await loyalty.getLoyaltySummaryForCustomer(admin, customerId)
      return okResponse({ balance: summary.balance, history: summary.history })
    }

    // ---- Admin routes ----
    if (segments[0] === 'admin') {
      const caller = await requireAdmin(req)
      const [, resource, id, sub] = segments

      if (resource === 'campaigns') {
        if (req.method === 'GET' && !id) return okResponse({ campaigns: await promotions.listCampaigns(admin) })
        if (req.method === 'POST' && !id) {
          const input = parseOrThrow(campaignInputSchema, body)
          const result = await promotions.createCampaign(admin, input)
          await writeAuditLog(admin, { actor: caller.profileId, actorType: 'admin', action: 'admin.campaign_created', entityType: 'campaign', entityId: (result as { id: string }).id })
          return okResponse(result, 201)
        }
        if (req.method === 'PATCH' && id) {
          const input = parseOrThrow(updateCampaignSchema, body)
          const result = await promotions.updateCampaign(admin, id, input)
          await writeAuditLog(admin, { actor: caller.profileId, actorType: 'admin', action: 'admin.campaign_updated', entityType: 'campaign', entityId: id })
          return okResponse(result)
        }
      }

      if (resource === 'promotions') {
        if (req.method === 'GET' && !id) return okResponse({ promotions: await promotions.listPromotions(admin) })
        if (req.method === 'POST' && !id) {
          const input = parseOrThrow(promotionInputSchema, body)
          const result = await promotions.createPromotion(admin, input)
          await writeAuditLog(admin, { actor: caller.profileId, actorType: 'admin', action: 'admin.promotion_created', entityType: 'promotion', entityId: (result as { id: string }).id })
          return okResponse(result, 201)
        }
        if (req.method === 'PATCH' && id) {
          const input = parseOrThrow(updatePromotionSchema, body)
          const result = await promotions.updatePromotion(admin, id, input)
          await writeAuditLog(admin, { actor: caller.profileId, actorType: 'admin', action: 'admin.promotion_updated', entityType: 'promotion', entityId: id })
          return okResponse(result)
        }
      }

      if (resource === 'coupons') {
        if (req.method === 'GET' && !id) return okResponse({ coupons: await promotions.listCoupons(admin) })
        if (req.method === 'POST' && !id) {
          const input = parseOrThrow(couponInputSchema, body)
          const result = await promotions.createCoupon(admin, { ...input, code: input.code.toUpperCase() })
          await writeAuditLog(admin, { actor: caller.profileId, actorType: 'admin', action: 'admin.coupon_created', entityType: 'coupon', entityId: (result as { id: string }).id, metadata: { code: input.code } })
          return okResponse(result, 201)
        }
        if (req.method === 'GET' && id && sub === 'usage') {
          return okResponse(await promotions.getCouponUsage(admin, id))
        }
        if (req.method === 'PATCH' && id) {
          const input = parseOrThrow(updateCouponSchema, body)
          const result = await promotions.updateCoupon(admin, id, input)
          await writeAuditLog(admin, { actor: caller.profileId, actorType: 'admin', action: 'admin.coupon_updated', entityType: 'coupon', entityId: id, metadata: { status: input.status ?? null } })
          return okResponse(result)
        }
      }

      if (resource === 'segments' && id && req.method === 'GET') {
        return okResponse(await classifyCustomer(admin, id))
      }

      if (resource === 'abandoned-carts' && req.method === 'GET') {
        const days = Number(url.searchParams.get('days') ?? '3')
        const inactiveDays = Number.isFinite(days) && days > 0 ? days : 3
        return okResponse({ carts: await listAbandonedCarts(admin, inactiveDays) })
      }

      throw new NotFoundError('Route')
    }

    throw new NotFoundError('route', 'No matching route for this method/path on the promotions function.')
  }),
)
