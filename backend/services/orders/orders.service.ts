/**
 * Order creation/read/cancellation — the write path for Phase 6 (Checkout &
 * Order Management). Called ONLY from supabase/functions/orders/index.ts
 * (service-role client) with an already-resolved caller profileId.
 *
 * Order creation deliberately has NO client-supplied line items or prices:
 * it always derives its items from backend/services/cart/cart.service.ts's
 * getCartSummary(), which is itself always revalidated against live
 * product_variants — so "recalculate every price/discount server-side at
 * final order creation" (spec) falls out of reusing that function rather
 * than needing a second revalidation pass here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateOrderTotals } from '../../lib/money/index.ts'
import { buildOrderItemSnapshots, deliveryCost, generateUniqueOrderNumber, type DeliveryMethod } from '../../lib/orders/index.ts'
import { assertOrderStatusTransition, type OrderStatus } from '../../lib/status/index.ts'
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors/index.ts'
import { ensureCustomerForProfile } from '../../lib/auth/linking.ts'
import { makeCustomerLinkDeps } from '../auth/auth.service.ts'
import { getCartSummary, markCartConverted } from '../cart/cart.service.ts'
import {
  recordCancellationTransaction,
  recordDeliveryChargeTransaction,
  recordDiscountTransaction,
  recordSaleTransaction,
} from '../accounting/accounting.service.ts'
import type { CheckoutInput } from '../../lib/validation/index.ts'
import {
  applyPromotionAtCheckout,
  recordAppliedPromotion,
  releasePromotionClaimOnFailure,
  type ClaimedPromotion,
} from '../promotions/promotions.service.ts'
import { getLoyaltyBalance, redeemLoyaltyPoints } from '../promotions/loyalty.service.ts'
import { computeMaxRedeemablePoints, REDEMPTION_MINOR_UNITS_PER_POINT } from '../../lib/loyalty/index.ts'

const ORDER_COLUMNS = `
  id, order_number, customer_id, email, phone, currency, subtotal, discount_total, shipping_total, tax_total, grand_total,
  order_status, payment_status, fulfillment_status, payment_method, source, customer_notes,
  shipping_recipient_name, shipping_phone, shipping_address_line_1, shipping_address_line_2, shipping_city,
  shipping_province, shipping_postal_code, shipping_country, delivery_method, placed_at
`

const ORDER_ITEM_COLUMNS =
  'id, product_id, variant_id, sku, product_name, variant_name, quantity, unit_price, original_price, discount_amount, line_total'

interface OrderRow {
  id: string
  order_number: string
  customer_id: string | null
  email: string | null
  phone: string | null
  currency: string
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  grand_total: number
  order_status: OrderStatus
  payment_status: string
  fulfillment_status: string
  payment_method: string | null
  source: string
  customer_notes: string | null
  shipping_recipient_name: string | null
  shipping_phone: string | null
  shipping_address_line_1: string | null
  shipping_address_line_2: string | null
  shipping_city: string | null
  shipping_province: string | null
  shipping_postal_code: string | null
  shipping_country: string | null
  delivery_method: string | null
  placed_at: string
}

interface OrderItemRow {
  id: string
  product_id: string | null
  variant_id: string | null
  sku: string
  product_name: string
  variant_name: string | null
  quantity: number
  unit_price: number
  original_price: number | null
  discount_amount: number
  line_total: number
}

export interface OrderSummary {
  id: string
  orderNumber: string
  email: string | null
  phone: string | null
  currency: string
  subtotal: number
  discountTotal: number
  shippingTotal: number
  taxTotal: number
  grandTotal: number
  orderStatus: string
  paymentStatus: string
  fulfillmentStatus: string
  paymentMethod: string | null
  customerNotes: string | null
  shippingAddress: {
    recipientName: string | null
    phone: string | null
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    province: string | null
    postalCode: string | null
    country: string | null
  }
  deliveryMethod: string | null
  placedAt: string
  items: {
    id: string
    productId: string | null
    variantId: string | null
    sku: string
    productName: string
    variantName: string | null
    quantity: number
    unitPrice: number
    originalPrice: number | null
    lineTotal: number
  }[]
}

function mapOrder(row: OrderRow, items: OrderItemRow[]): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    email: row.email,
    phone: row.phone,
    currency: row.currency,
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    shippingTotal: row.shipping_total,
    taxTotal: row.tax_total,
    grandTotal: row.grand_total,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    paymentMethod: row.payment_method,
    customerNotes: row.customer_notes,
    shippingAddress: {
      recipientName: row.shipping_recipient_name,
      phone: row.shipping_phone,
      addressLine1: row.shipping_address_line_1,
      addressLine2: row.shipping_address_line_2,
      city: row.shipping_city,
      province: row.shipping_province,
      postalCode: row.shipping_postal_code,
      country: row.shipping_country,
    },
    deliveryMethod: row.delivery_method,
    placedAt: row.placed_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id,
      sku: item.sku,
      productName: item.product_name,
      variantName: item.variant_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      originalPrice: item.original_price,
      lineTotal: item.line_total,
    })),
  }
}

async function findOrCreateCustomer(db: SupabaseClient, profileId: string, email?: string, phone?: string): Promise<string> {
  const deps = makeCustomerLinkDeps(db)
  const result = await ensureCustomerForProfile(deps, { profileId, email, phone })
  return result.customer.id
}

async function fetchOrderWithItems(db: SupabaseClient, orderId: string): Promise<OrderSummary | null> {
  const { data: order, error } = await db.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle()
  if (error) throw error
  if (!order) return null

  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select(ORDER_ITEM_COLUMNS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (itemsError) throw itemsError

  return mapOrder(order as OrderRow, (items ?? []) as OrderItemRow[])
}

/**
 * Create an order from the caller's current server-side cart. Always
 * re-reads cart totals/prices via getCartSummary() immediately before
 * writing — never trusts anything the client asserted about price/
 * availability. Blocks (rather than silently proceeding with a smaller
 * order) when the cart is empty or the very act of reading it just dropped
 * a stale line, so the customer sees "please review your cart" instead of
 * an order total that quietly differs from what they last looked at.
 */
export async function createOrder(db: SupabaseClient, profileId: string, input: CheckoutInput): Promise<OrderSummary> {
  const cart = await getCartSummary(db, profileId)

  if (cart.items.length === 0) {
    throw new ValidationError('Your cart is empty.')
  }
  if (cart.removedItems.length > 0) {
    throw new ValidationError(
      'Some items in your cart changed availability. Please review your cart before checking out.',
      cart.removedItems.map((r) => ({ path: 'items', message: r.reason })),
    )
  }

  const customerId = await findOrCreateCustomer(db, profileId, input.email, input.phone)

  const orderItems = buildOrderItemSnapshots(
    cart.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      compareAtPrice: item.compareAtPrice,
    })),
  )

  let shippingTotal = deliveryCost(input.deliveryMethod as DeliveryMethod)

  // Phase 13: server-side coupon/automatic-promotion evaluation — NEVER a
  // client-supplied discount amount. A coupon claims a usage slot
  // atomically here (see promotions.service.ts's claimCouponUsage); if
  // anything below fails before the order is durably created, the claim is
  // released in the catch block so a failed checkout never silently burns
  // a limited coupon's use.
  const claimedPromotion: ClaimedPromotion | null = await applyPromotionAtCheckout(db, {
    customerId,
    couponCode: input.couponCode,
    items: cart.items.map((item) => ({ productId: item.productId, lineTotal: item.lineTotal })),
    shippingTotal,
  })
  if (claimedPromotion?.freeShipping) shippingTotal = 0

  // Phase 13: loyalty-points redemption, re-validated against the
  // customer's real ledger balance (see loyalty.service.ts) — also never a
  // client-supplied discount amount. Combined with any coupon discount,
  // never allowed to exceed the merchandise subtotal.
  let loyaltyDiscountValue = 0
  if (input.redeemPoints) {
    const balance = await getLoyaltyBalance(db, customerId)
    const remainingSubtotal = Math.max(cart.subtotal - (claimedPromotion?.discountAmount ?? 0), 0)
    const maxRedeemable = computeMaxRedeemablePoints(balance, remainingSubtotal)
    if (input.redeemPoints > maxRedeemable) {
      await releasePromotionClaimOnFailure(db, claimedPromotion)
      throw new ValidationError(
        maxRedeemable === 0
          ? 'You have no redeemable loyalty points available for this order.'
          : `You can redeem at most ${maxRedeemable} points for this order.`,
      )
    }
    loyaltyDiscountValue = input.redeemPoints * REDEMPTION_MINOR_UNITS_PER_POINT
  }

  const discountTotal = (claimedPromotion?.discountAmount ?? 0) + loyaltyDiscountValue

  let totals
  try {
    totals = calculateOrderTotals({ subtotal: cart.subtotal, discountTotal, shippingTotal })
  } catch (err) {
    await releasePromotionClaimOnFailure(db, claimedPromotion)
    throw err
  }

  const orderNumber = await generateUniqueOrderNumber(
    new Date(),
    () => crypto.randomUUID().replace(/-/g, '').slice(0, 6),
    async (candidate) => {
      const { data } = await db.from('orders').select('id').eq('order_number', candidate).maybeSingle()
      return Boolean(data)
    },
  )

  let order: OrderRow
  try {
    const { data: orderRow, error: orderError } = await db
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        email: input.email ?? null,
        phone: input.phone ?? null,
        currency: cart.currency,
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        shipping_total: totals.shippingTotal,
        tax_total: totals.taxTotal,
        grand_total: totals.grandTotal,
        payment_method: input.paymentMethod,
        source: input.source,
        customer_notes: input.customerNotes ?? null,
        shipping_recipient_name: input.shippingAddress.recipientName,
        shipping_phone: input.shippingAddress.phone,
        shipping_address_line_1: input.shippingAddress.addressLine1,
        shipping_address_line_2: input.shippingAddress.addressLine2 ?? null,
        shipping_city: input.shippingAddress.city,
        shipping_province: input.shippingAddress.province ?? null,
        shipping_postal_code: input.shippingAddress.postalCode ?? null,
        shipping_country: input.shippingAddress.country,
        customer_address_id: input.shippingAddress.savedAddressId ?? null,
        delivery_method: input.deliveryMethod,
      })
      .select(ORDER_COLUMNS)
      .single()
    if (orderError) {
      if ((orderError as { code?: string }).code === '23505') throw new ConflictError('Order number collision — please retry.')
      throw orderError
    }
    order = orderRow as OrderRow

    const { error: itemsError } = await db.from('order_items').insert(
      orderItems.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId,
        sku: item.sku,
        product_name: item.productName,
        variant_name: item.variantName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        original_price: item.originalPrice,
        discount_amount: item.discountAmount,
        line_total: item.lineTotal,
      })),
    )
    if (itemsError) throw itemsError
  } catch (err) {
    // Order/items insert never completed — give back the coupon usage slot
    // claimed above so a failed checkout never silently burns it (see
    // promotions.service.ts's claimCouponUsage doc comment).
    await releasePromotionClaimOnFailure(db, claimedPromotion)
    throw err
  }

  await db.from('order_status_history').insert({ order_id: order.id, from_status: null, to_status: 'pending' })

  // Phase 13: record the applied promotion/coupon (discounts audit row +
  // coupon_redemptions) and the checkout-time loyalty-points redemption,
  // now that the order row exists. Both are idempotent per order id, same
  // "sequential best-effort write, propagate any error" shape the Phase 7
  // accounting calls below already use.
  if (claimedPromotion) {
    await recordAppliedPromotion(db, { orderId: order.id, customerId, claimed: claimedPromotion })
  }
  if (input.redeemPoints && loyaltyDiscountValue > 0) {
    await redeemLoyaltyPoints(db, {
      customerId,
      orderId: order.id,
      orderNumber: order.order_number,
      points: input.redeemPoints,
      subtotalMinorUnits: cart.subtotal,
    })
  }

  await db.from('payments').insert({
    order_id: order.id,
    provider: input.paymentMethod === 'easypaisa' ? 'easypaisa' : 'cod',
    payment_method: input.paymentMethod,
    amount: totals.grandTotal,
    currency: cart.currency,
    status: 'pending',
  })

  // Phase 7 (Local Operational Accounting Layer): local-first financial
  // event recording — commit the sale (and, when non-zero, discount and
  // delivery-charge) events before the order-creation flow completes, so
  // every order has a durable local financial record queued for eventual
  // ERP sync (Phase 8) regardless of when/whether that sync succeeds. Both
  // recordSaleTransaction and recordDiscountTransaction/
  // recordDeliveryChargeTransaction are idempotent per order id (see
  // backend/services/accounting/accounting.service.ts), so a retried
  // createOrder() call (e.g. after this step throws and the Edge
  // Function's idempotency layer retries) can never double-record them.
  await recordSaleTransaction(db, { id: order.id, orderNumber: order.order_number, currency: cart.currency, grandTotal: totals.grandTotal })
  if (totals.discountTotal > 0) {
    await recordDiscountTransaction(db, { id: order.id, orderNumber: order.order_number, currency: cart.currency, grandTotal: totals.grandTotal, discountTotal: totals.discountTotal })
  }
  if (totals.shippingTotal > 0) {
    await recordDeliveryChargeTransaction(db, { id: order.id, orderNumber: order.order_number, currency: cart.currency, grandTotal: totals.grandTotal, shippingTotal: totals.shippingTotal })
  }

  if (cart.cartId) await markCartConverted(db, cart.cartId)

  const items = (
    await db.from('order_items').select(ORDER_ITEM_COLUMNS).eq('order_id', order.id).order('created_at', { ascending: true })
  ).data as OrderItemRow[] | null

  return mapOrder(order, items ?? [])
}

/** Verify `orderId` belongs to a customer linked to `profileId` (or the caller is an admin) before returning it. */
export async function getOrderForCaller(
  db: SupabaseClient,
  profileId: string,
  isAdmin: boolean,
  orderId: string,
): Promise<OrderSummary> {
  const order = await fetchOrderWithItems(db, orderId)
  if (!order) throw new NotFoundError('Order')
  if (isAdmin) return order

  const { data: customer } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  const { data: orderCustomer } = await db.from('orders').select('customer_id').eq('id', orderId).maybeSingle()
  if (!customer || !orderCustomer || orderCustomer.customer_id !== customer.id) {
    throw new NotFoundError('Order') // never distinguish "not yours" from "doesn't exist" — see security note in the Edge Function header
  }
  return order
}

export async function listOrdersForCaller(db: SupabaseClient, profileId: string): Promise<OrderSummary[]> {
  const { data: customer } = await db.from('customers').select('id').eq('profile_id', profileId).maybeSingle()
  if (!customer) return []

  const { data: orders, error } = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('customer_id', customer.id)
    .order('placed_at', { ascending: false })
  if (error) throw error

  const results: OrderSummary[] = []
  for (const order of (orders ?? []) as OrderRow[]) {
    const { data: items } = await db
      .from('order_items')
      .select(ORDER_ITEM_COLUMNS)
      .eq('order_id', order.id)
      .order('created_at', { ascending: true })
    results.push(mapOrder(order, (items ?? []) as OrderItemRow[]))
  }
  return results
}

/**
 * Guest order lookup by order number + email — the fallback access path for
 * a guest who returns in a different browser session (their anonymous-auth
 * session, and therefore RLS self-read, only persists per-browser). Order
 * number is a non-sequential, non-guessable UUID-derived value and an exact
 * email match is also required, so this doesn't expose orders by
 * enumeration — but it also isn't rate-limited in this environment; see the
 * completion report's known limitations.
 */
export async function lookupGuestOrder(db: SupabaseClient, orderNumber: string, email: string): Promise<OrderSummary> {
  const { data, error } = await db
    .from('orders')
    .select('id, email')
    .eq('order_number', orderNumber)
    .maybeSingle()
  if (error) throw error
  if (!data || (data.email as string | null)?.toLowerCase() !== email.toLowerCase()) {
    throw new NotFoundError('Order', 'No order matches that order number and email.')
  }
  const order = await fetchOrderWithItems(db, data.id as string)
  if (!order) throw new NotFoundError('Order')
  return order
}

/**
 * Customer-initiated cancellation request. Only valid while the order is
 * still `pending` or `confirmed` (assertOrderStatusTransition enforces
 * this — see backend/lib/status) — anything further along needs an admin
 * decision (Phase 12), not a self-service cancel.
 */
export async function requestOrderCancellation(
  db: SupabaseClient,
  profileId: string,
  isAdmin: boolean,
  orderId: string,
  reason?: string,
): Promise<OrderSummary> {
  const order = await getOrderForCaller(db, profileId, isAdmin, orderId)
  assertOrderStatusTransition(order.orderStatus as OrderStatus, 'cancelled')

  const { error } = await db.from('orders').update({ order_status: 'cancelled' }).eq('id', orderId)
  if (error) throw error
  await db.from('order_status_history').insert({
    order_id: orderId,
    from_status: order.orderStatus,
    to_status: 'cancelled',
    note: reason ?? null,
  })

  // Phase 7: record the cancellation as its own local financial event
  // (idempotent per order id) — see recordSaleTransaction's call site
  // above for the same "local-first, best-effort sequential write"
  // rationale.
  await recordCancellationTransaction(db, {
    id: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    grandTotal: order.grandTotal,
  })

  const updated = await fetchOrderWithItems(db, orderId)
  if (!updated) throw new NotFoundError('Order')
  return updated
}
