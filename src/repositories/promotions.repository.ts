/**
 * Thin wrapper around the `promotions` Edge Function
 * (backend/services/promotions/promotions.service.ts). Same pattern as
 * src/repositories/orders.repository.ts — every discount amount shown here
 * is exactly what the server computed, never assembled client-side.
 */
import { callEdgeFunction } from '../lib/supabase/functions'

export interface DiscountPreview {
  eligible: boolean
  reasons: string[]
  discountAmount: number // minor units
  freeShipping: boolean
  promotionName: string | null
  couponCode: string | null
  cartSubtotal: number
  loyaltyBalance: number
  maxRedeemablePoints: number
}

export function previewDiscount(couponCode?: string): Promise<DiscountPreview> {
  return callEdgeFunction<DiscountPreview>('promotions/preview', { method: 'POST', body: { couponCode: couponCode || undefined } })
}

// ---------------------------------------------------------------------------
// Admin campaign/promotion/coupon management
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  starts_at: string | null
  ends_at: string | null
}

export interface Promotion {
  id: string
  campaign_id: string | null
  name: string
  description: string | null
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping'
  discount_value: number
  status: string
  starts_at: string | null
  ends_at: string | null
  min_spend: number | null
  first_order_only: boolean
  applies_to: 'all' | 'category' | 'collection' | 'product'
  scope_id: string | null
}

export interface Coupon {
  id: string
  promotion_id: string
  code: string
  usage_limit: number | null
  usage_limit_per_customer: number | null
  times_used: number
  status: string
}

export interface CouponUsage {
  couponId: string
  code: string
  timesUsed: number
  usageLimit: number | null
  redemptions: { orderId: string; customerId: string; amount: number; createdAt: string; released: boolean }[]
}

export async function listCampaigns(): Promise<Campaign[]> {
  const { campaigns } = await callEdgeFunction<{ campaigns: Campaign[] }>('promotions/admin/campaigns', { method: 'GET' })
  return campaigns
}
export function createCampaign(input: { name: string; slug: string; description?: string; status?: string }): Promise<Campaign> {
  return callEdgeFunction<Campaign>('promotions/admin/campaigns', { method: 'POST', body: input })
}
export function updateCampaign(id: string, input: Partial<{ name: string; description: string; status: string }>): Promise<Campaign> {
  return callEdgeFunction<Campaign>(`promotions/admin/campaigns/${id}`, { method: 'PATCH', body: input })
}

export async function listPromotions(): Promise<Promotion[]> {
  const { promotions } = await callEdgeFunction<{ promotions: Promotion[] }>('promotions/admin/promotions', { method: 'GET' })
  return promotions
}
export function createPromotion(input: Record<string, unknown>): Promise<Promotion> {
  return callEdgeFunction<Promotion>('promotions/admin/promotions', { method: 'POST', body: input })
}
export function updatePromotion(id: string, input: Record<string, unknown>): Promise<Promotion> {
  return callEdgeFunction<Promotion>(`promotions/admin/promotions/${id}`, { method: 'PATCH', body: input })
}

export async function listCoupons(): Promise<Coupon[]> {
  const { coupons } = await callEdgeFunction<{ coupons: Coupon[] }>('promotions/admin/coupons', { method: 'GET' })
  return coupons
}
export function createCoupon(input: { promotionId: string; code: string; usageLimit?: number; usageLimitPerCustomer?: number; status?: string }): Promise<Coupon> {
  return callEdgeFunction<Coupon>('promotions/admin/coupons', { method: 'POST', body: input })
}
export function updateCoupon(id: string, input: Partial<{ status: string; usageLimit: number | null; usageLimitPerCustomer: number | null }>): Promise<Coupon> {
  return callEdgeFunction<Coupon>(`promotions/admin/coupons/${id}`, { method: 'PATCH', body: input })
}
export function getCouponUsage(id: string): Promise<CouponUsage> {
  return callEdgeFunction<CouponUsage>(`promotions/admin/coupons/${id}/usage`, { method: 'GET' })
}

export interface AbandonedCart {
  cartId: string
  profileId: string
  itemCount: number
  subtotalHint: number
  updatedAt: string
}
export async function listAbandonedCarts(days = 3): Promise<AbandonedCart[]> {
  const { carts } = await callEdgeFunction<{ carts: AbandonedCart[] }>(`promotions/admin/abandoned-carts?days=${days}`, { method: 'GET' })
  return carts
}
