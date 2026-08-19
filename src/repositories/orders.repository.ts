/**
 * Thin wrapper around the `orders` Edge Function
 * (backend/services/orders/orders.service.ts). Same auth/identity model as
 * cart.repository.ts (signed-in OR anonymous-auth guest), only used when
 * isSupabaseConfigured() — see src/pages/Checkout.jsx / src/pages/Cart.jsx
 * for the WhatsApp-only fallback used otherwise.
 */
import { callEdgeFunction } from '../lib/supabase/functions'

export interface OrderItemSummary {
  id: string
  productId: string | null
  variantId: string | null
  sku: string
  productName: string
  variantName: string | null
  quantity: number
  unitPrice: number // minor units
  originalPrice: number | null
  lineTotal: number // minor units
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
  items: OrderItemSummary[]
}

export interface CheckoutShippingAddress {
  recipientName: string
  phone: string
  addressLine1: string
  addressLine2?: string
  city: string
  province?: string
  postalCode?: string
  country: string
  savedAddressId?: string
}

export interface CheckoutInput {
  email?: string
  phone?: string
  shippingAddress: CheckoutShippingAddress
  deliveryMethod: 'standard' | 'express'
  paymentMethod: 'cod' | 'easypaisa'
  customerNotes?: string
  source?: 'web' | 'whatsapp' | 'mobile' | 'admin'
}

/** `idempotencyKey` must be the same value across retries of the same checkout attempt (e.g. a double-click) — see backend/lib/idempotency. Generate a fresh one (crypto.randomUUID()) per NEW checkout attempt. */
export function createOrder(input: CheckoutInput, idempotencyKey: string): Promise<OrderSummary> {
  return callEdgeFunction<OrderSummary>('orders', {
    method: 'POST',
    body: input,
    headers: { 'x-idempotency-key': idempotencyKey },
  })
}

export function getOrder(orderId: string): Promise<OrderSummary> {
  return callEdgeFunction<OrderSummary>(`orders/${orderId}`, { method: 'GET' })
}

export async function listMyOrders(): Promise<OrderSummary[]> {
  const { orders } = await callEdgeFunction<{ orders: OrderSummary[] }>('orders', { method: 'GET' })
  return orders
}

export function cancelOrder(orderId: string, reason?: string): Promise<OrderSummary> {
  return callEdgeFunction<OrderSummary>(`orders/${orderId}/cancel`, { method: 'POST', body: { reason } })
}

export function lookupGuestOrder(orderNumber: string, email: string): Promise<OrderSummary> {
  return callEdgeFunction<OrderSummary>('orders/lookup', { method: 'POST', body: { orderNumber, email } })
}
