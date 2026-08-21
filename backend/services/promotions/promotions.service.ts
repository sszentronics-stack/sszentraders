/**
 * Promotions/coupon rule engine — DB-facing half of Phase 13. The pure
 * eligibility/discount-amount math lives in backend/lib/promotions and is
 * reused as-is; this module loads the real campaign/promotion/coupon rows
 * (0010_promotions.sql, extended by 0022_promotions_engine.sql) and the
 * caller's real cart, and is the ONLY place a discount amount is ever
 * decided — never the client (phase spec: "never trust a client-computed
 * discount amount").
 *
 * Concurrency: claimCouponUsage() below is the single conditional UPDATE
 * that makes "two concurrent checkouts both claim the last use of a
 * limited coupon" impossible — see its own doc comment and the migration's
 * header for why a plain UPDATE ... WHERE is sufficient here without
 * needing an explicit lock.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeDiscountAmount,
  evaluateCouponEligibility,
  pickBestAutomaticPromotion,
  type CartContext,
  type CartLineContext,
  type CouponRule,
  type CustomerContext,
  type DiscountBreakdown,
  type PromotionRule,
} from '../../lib/promotions/index.ts'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors/index.ts'
import { isFirstOrderCustomer } from './segmentation.service.ts'
import type { CartSummaryItem } from '../cart/cart.service.ts'

const PROMOTION_COLUMNS =
  'id, campaign_id, name, discount_type, discount_value, status, starts_at, ends_at, min_spend, first_order_only, applies_to, scope_id'
const COUPON_COLUMNS = 'id, promotion_id, code, usage_limit, usage_limit_per_customer, times_used, status'

interface PromotionRow {
  id: string
  campaign_id: string | null
  name: string
  discount_type: string
  discount_value: number
  status: string
  starts_at: string | null
  ends_at: string | null
  min_spend: number | null
  first_order_only: boolean
  applies_to: string
  scope_id: string | null
}

interface CouponRow {
  id: string
  promotion_id: string
  code: string
  usage_limit: number | null
  usage_limit_per_customer: number | null
  times_used: number
  status: string
}

function mapPromotion(row: PromotionRow): PromotionRule {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    discountType: row.discount_type as PromotionRule['discountType'],
    discountValue: row.discount_value,
    status: row.status as PromotionRule['status'],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    minSpend: row.min_spend,
    firstOrderOnly: row.first_order_only,
    appliesTo: row.applies_to as PromotionRule['appliesTo'],
    scopeId: row.scope_id,
  }
}

function mapCoupon(row: CouponRow): CouponRule {
  return {
    id: row.id,
    promotionId: row.promotion_id,
    code: row.code,
    usageLimit: row.usage_limit,
    usageLimitPerCustomer: row.usage_limit_per_customer,
    timesUsed: row.times_used,
    status: row.status as CouponRule['status'],
  }
}

/** Resolve category/collection ids per product so scoped promotions can be evaluated — a small extra read, only for the products actually in the cart. */
export async function buildCartContext(db: SupabaseClient, items: Pick<CartSummaryItem, 'productId' | 'lineTotal'>[]): Promise<CartContext> {
  const productIds = [...new Set(items.map((i) => i.productId))]
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0)

  if (productIds.length === 0) {
    return { subtotal, lines: [], currency: 'PKR' }
  }

  const [{ data: categoryRows, error: categoryError }, { data: collectionRows, error: collectionError }] = await Promise.all([
    db.from('product_categories').select('product_id, category_id').in('product_id', productIds),
    db.from('product_collections').select('product_id, collection_id').in('product_id', productIds),
  ])
  if (categoryError) throw categoryError
  if (collectionError) throw collectionError

  const categoriesByProduct = new Map<string, string[]>()
  for (const row of (categoryRows ?? []) as { product_id: string; category_id: string }[]) {
    const list = categoriesByProduct.get(row.product_id) ?? []
    list.push(row.category_id)
    categoriesByProduct.set(row.product_id, list)
  }
  const collectionsByProduct = new Map<string, string[]>()
  for (const row of (collectionRows ?? []) as { product_id: string; collection_id: string }[]) {
    const list = collectionsByProduct.get(row.product_id) ?? []
    list.push(row.collection_id)
    collectionsByProduct.set(row.product_id, list)
  }

  const lines: CartLineContext[] = items.map((item) => ({
    productId: item.productId,
    categoryIds: categoriesByProduct.get(item.productId) ?? [],
    collectionIds: collectionsByProduct.get(item.productId) ?? [],
    lineTotal: item.lineTotal,
  }))

  return { subtotal, lines, currency: 'PKR' }
}

async function buildCustomerContext(db: SupabaseClient, customerId: string | null, couponId?: string): Promise<CustomerContext> {
  if (!customerId) return { customerId: null, isFirstOrder: true }
  const isFirstOrder = await isFirstOrderCustomer(db, customerId)

  let customerCouponUseCount: number | undefined
  if (couponId) {
    const { count, error } = await db
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('customer_id', customerId)
      .is('released_at', null)
    if (error) throw error
    customerCouponUseCount = count ?? 0
  }

  return { customerId, isFirstOrder, customerCouponUseCount }
}

export async function findCouponByCode(db: SupabaseClient, code: string): Promise<{ coupon: CouponRule; promotion: PromotionRule } | null> {
  const { data: couponRow, error } = await db.from('coupons').select(COUPON_COLUMNS).ilike('code', code).maybeSingle()
  if (error) throw error
  if (!couponRow) return null

  const { data: promotionRow, error: promotionError } = await db
    .from('promotions')
    .select(PROMOTION_COLUMNS)
    .eq('id', (couponRow as CouponRow).promotion_id)
    .maybeSingle()
  if (promotionError) throw promotionError
  if (!promotionRow) return null

  return { coupon: mapCoupon(couponRow as CouponRow), promotion: mapPromotion(promotionRow as PromotionRow) }
}

async function listAutomaticPromotions(db: SupabaseClient): Promise<PromotionRule[]> {
  const { data: couponPromotionIds, error: couponError } = await db.from('coupons').select('promotion_id')
  if (couponError) throw couponError
  const excluded = new Set((couponPromotionIds ?? []).map((r) => r.promotion_id as string))

  const { data, error } = await db.from('promotions').select(PROMOTION_COLUMNS).eq('status', 'active')
  if (error) throw error
  return ((data ?? []) as PromotionRow[]).filter((row) => !excluded.has(row.id)).map(mapPromotion)
}

export interface DiscountPreview {
  eligible: boolean
  reasons: string[]
  discountAmount: number
  freeShipping: boolean
  promotionName: string | null
  couponCode: string | null
}

/**
 * Non-mutating cart-time / checkout-time preview: what discount would
 * apply right now, and — when a coupon code doesn't qualify — exactly why
 * not (phase spec: "show applied savings and unmet-eligibility reasons,
 * never a dark pattern").
 */
export async function previewDiscount(
  db: SupabaseClient,
  input: { customerId: string | null; couponCode?: string; items: Pick<CartSummaryItem, 'productId' | 'lineTotal'>[] },
): Promise<DiscountPreview> {
  const cart = await buildCartContext(db, input.items)

  if (input.couponCode) {
    const found = await findCouponByCode(db, input.couponCode)
    if (!found) {
      return { eligible: false, reasons: ['This coupon code does not exist.'], discountAmount: 0, freeShipping: false, promotionName: null, couponCode: input.couponCode }
    }
    const customer = await buildCustomerContext(db, input.customerId, found.coupon.id)
    const eligibility = evaluateCouponEligibility(found.coupon, found.promotion, cart, customer)
    const breakdown: DiscountBreakdown = eligibility.eligible ? computeDiscountAmount(found.promotion, cart) : { discountAmount: 0, freeShipping: false }
    return {
      eligible: eligibility.eligible,
      reasons: eligibility.reasons,
      discountAmount: breakdown.discountAmount,
      freeShipping: breakdown.freeShipping,
      promotionName: found.promotion.name,
      couponCode: found.coupon.code,
    }
  }

  const automatic = await listAutomaticPromotions(db)
  const customer = await buildCustomerContext(db, input.customerId)
  const best = pickBestAutomaticPromotion(automatic, cart, customer, 0)
  if (!best) {
    return { eligible: false, reasons: [], discountAmount: 0, freeShipping: false, promotionName: null, couponCode: null }
  }
  return {
    eligible: true,
    reasons: [],
    discountAmount: best.breakdown.discountAmount,
    freeShipping: best.breakdown.freeShipping,
    promotionName: best.promotion.name,
    couponCode: null,
  }
}

export interface ClaimedPromotion {
  promotion: PromotionRule
  coupon: CouponRule | null
  discountAmount: number
  freeShipping: boolean
}

/**
 * The single atomic conditional UPDATE that prevents a coupon from being
 * used more times than usage_limit allows under concurrent checkouts.
 * `times_used < usage_limit` is evaluated and incremented by Postgres in
 * one statement — there is no read-then-write gap for a second concurrent
 * request to land in. Returns false (no row updated) when the limit was
 * already reached, including by a request that won the race a moment
 * earlier.
 */
async function claimCouponUsage(db: SupabaseClient, couponId: string): Promise<boolean> {
  const { data, error } = await db.rpc('claim_coupon_usage', { p_coupon_id: couponId })
  if (error) throw error
  return Boolean(data)
}

async function releaseCouponClaim(db: SupabaseClient, couponId: string): Promise<void> {
  const { error } = await db.rpc('release_coupon_usage', { p_coupon_id: couponId })
  if (error) throw error
}

/**
 * Validate + (for a coupon) atomically claim a usage slot, BEFORE order
 * creation proceeds. Called from orders.service.ts::createOrder. Throws on
 * an invalid/ineligible/exhausted coupon — order creation never proceeds
 * with a discount the server didn't just verify.
 */
export async function applyPromotionAtCheckout(
  db: SupabaseClient,
  input: { customerId: string | null; couponCode?: string; items: Pick<CartSummaryItem, 'productId' | 'lineTotal'>[]; shippingTotal: number },
): Promise<ClaimedPromotion | null> {
  const cart = await buildCartContext(db, input.items)

  if (input.couponCode) {
    const found = await findCouponByCode(db, input.couponCode)
    if (!found) throw new ValidationError('This coupon code does not exist.')

    const customer = await buildCustomerContext(db, input.customerId, found.coupon.id)
    const eligibility = evaluateCouponEligibility(found.coupon, found.promotion, cart, customer)
    if (!eligibility.eligible) throw new ValidationError(eligibility.reasons[0] ?? 'This coupon is not eligible for your cart.', eligibility.reasons.map((r) => ({ path: 'couponCode', message: r })))

    const claimed = await claimCouponUsage(db, found.coupon.id)
    if (!claimed) throw new ConflictError('This coupon is no longer available.')

    const breakdown = computeDiscountAmount(found.promotion, cart)
    return { promotion: found.promotion, coupon: found.coupon, discountAmount: breakdown.discountAmount, freeShipping: breakdown.freeShipping }
  }

  const automatic = await listAutomaticPromotions(db)
  const customer = await buildCustomerContext(db, input.customerId)
  const best = pickBestAutomaticPromotion(automatic, cart, customer, input.shippingTotal)
  if (!best) return null

  return { promotion: best.promotion, coupon: null, discountAmount: best.breakdown.discountAmount, freeShipping: best.breakdown.freeShipping }
}

/** Roll back a coupon claim if order creation fails after claiming it (compensating write — see accounting.service.ts's module doc for the same pattern used elsewhere in this codebase). */
export async function releasePromotionClaimOnFailure(db: SupabaseClient, claimed: ClaimedPromotion | null): Promise<void> {
  if (claimed?.coupon) await releaseCouponClaim(db, claimed.coupon.id)
}

/**
 * After the order row exists: record the discounts audit row and (for a
 * coupon) the redemption row. Called from orders.service.ts::createOrder
 * right after order insert.
 */
export async function recordAppliedPromotion(
  db: SupabaseClient,
  input: { orderId: string; customerId: string; claimed: ClaimedPromotion },
): Promise<void> {
  const { error: discountError } = await db.from('discounts').insert({
    order_id: input.orderId,
    promotion_id: input.claimed.promotion.id,
    coupon_id: input.claimed.coupon?.id ?? null,
    amount: input.claimed.discountAmount,
  })
  if (discountError) throw discountError

  if (input.claimed.coupon) {
    const { error: redemptionError } = await db.from('coupon_redemptions').insert({
      coupon_id: input.claimed.coupon.id,
      customer_id: input.customerId,
      order_id: input.orderId,
      amount: input.claimed.discountAmount,
    })
    if (redemptionError && (redemptionError as { code?: string }).code !== '23505') throw redemptionError
  }
}

// ---------------------------------------------------------------------------
// Admin campaign/promotion/coupon management (Phase 12-style CRUD, built
// standalone per the phase's concurrency notice — see docs/phase-13-completion-report.md).
// ---------------------------------------------------------------------------

export interface CampaignInput {
  name: string
  slug: string
  description?: string
  status?: 'draft' | 'active' | 'paused' | 'expired' | 'archived'
  startsAt?: string | null
  endsAt?: string | null
}

export async function listCampaigns(db: SupabaseClient) {
  const { data, error } = await db.from('campaigns').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createCampaign(db: SupabaseClient, input: CampaignInput) {
  const { data, error } = await db
    .from('campaigns')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      status: input.status ?? 'draft',
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCampaign(db: SupabaseClient, id: string, input: Partial<CampaignInput>) {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.status !== undefined) patch.status = input.status
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt
  const { data, error } = await db.from('campaigns').update(patch).eq('id', id).select('*').maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Campaign')
  return data
}

export interface PromotionInput {
  campaignId?: string | null
  name: string
  description?: string
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping'
  discountValue: number
  status?: 'draft' | 'active' | 'paused' | 'expired' | 'archived'
  startsAt?: string | null
  endsAt?: string | null
  minSpend?: number | null
  firstOrderOnly?: boolean
  appliesTo?: 'all' | 'category' | 'collection' | 'product'
  scopeId?: string | null
}

export async function listPromotions(db: SupabaseClient) {
  const { data, error } = await db.from('promotions').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createPromotion(db: SupabaseClient, input: PromotionInput) {
  const { data, error } = await db
    .from('promotions')
    .insert({
      campaign_id: input.campaignId ?? null,
      name: input.name,
      description: input.description ?? null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      status: input.status ?? 'draft',
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      min_spend: input.minSpend ?? null,
      first_order_only: input.firstOrderOnly ?? false,
      applies_to: input.appliesTo ?? 'all',
      scope_id: input.scopeId ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updatePromotion(db: SupabaseClient, id: string, input: Partial<PromotionInput>) {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.discountType !== undefined) patch.discount_type = input.discountType
  if (input.discountValue !== undefined) patch.discount_value = input.discountValue
  if (input.status !== undefined) patch.status = input.status
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt
  if (input.endsAt !== undefined) patch.ends_at = input.endsAt
  if (input.minSpend !== undefined) patch.min_spend = input.minSpend
  if (input.firstOrderOnly !== undefined) patch.first_order_only = input.firstOrderOnly
  if (input.appliesTo !== undefined) patch.applies_to = input.appliesTo
  if (input.scopeId !== undefined) patch.scope_id = input.scopeId
  const { data, error } = await db.from('promotions').update(patch).eq('id', id).select('*').maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Promotion')
  return data
}

export interface CouponInput {
  promotionId: string
  code: string
  usageLimit?: number | null
  usageLimitPerCustomer?: number | null
  status?: 'draft' | 'active' | 'paused' | 'expired' | 'archived'
}

export async function listCoupons(db: SupabaseClient) {
  const { data, error } = await db.from('coupons').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createCoupon(db: SupabaseClient, input: CouponInput) {
  const { data, error } = await db
    .from('coupons')
    .insert({
      promotion_id: input.promotionId,
      code: input.code,
      usage_limit: input.usageLimit ?? null,
      usage_limit_per_customer: input.usageLimitPerCustomer ?? null,
      status: input.status ?? 'draft',
    })
    .select('*')
    .single()
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new ConflictError('A coupon with this code already exists.')
    throw error
  }
  return data
}

export async function updateCoupon(db: SupabaseClient, id: string, input: Partial<CouponInput>) {
  const patch: Record<string, unknown> = {}
  if (input.usageLimit !== undefined) patch.usage_limit = input.usageLimit
  if (input.usageLimitPerCustomer !== undefined) patch.usage_limit_per_customer = input.usageLimitPerCustomer
  if (input.status !== undefined) patch.status = input.status
  const { data, error } = await db.from('coupons').update(patch).eq('id', id).select('*').maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Coupon')
  return data
}

export interface CouponUsageSummary {
  couponId: string
  code: string
  timesUsed: number
  usageLimit: number | null
  redemptions: { orderId: string; customerId: string; amount: number; createdAt: string; released: boolean }[]
}

export async function getCouponUsage(db: SupabaseClient, couponId: string): Promise<CouponUsageSummary> {
  const { data: coupon, error } = await db.from('coupons').select(COUPON_COLUMNS).eq('id', couponId).maybeSingle()
  if (error) throw error
  if (!coupon) throw new NotFoundError('Coupon')

  const { data: redemptions, error: redemptionsError } = await db
    .from('coupon_redemptions')
    .select('order_id, customer_id, amount, created_at, released_at')
    .eq('coupon_id', couponId)
    .order('created_at', { ascending: false })
  if (redemptionsError) throw redemptionsError

  return {
    couponId: (coupon as CouponRow).id,
    code: (coupon as CouponRow).code,
    timesUsed: (coupon as CouponRow).times_used,
    usageLimit: (coupon as CouponRow).usage_limit,
    redemptions: (redemptions ?? []).map((r) => ({
      orderId: r.order_id as string,
      customerId: r.customer_id as string,
      amount: r.amount as number,
      createdAt: r.created_at as string,
      released: r.released_at != null,
    })),
  }
}
