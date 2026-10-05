import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import * as ordersApi from '../repositories/orders.repository'
import { formatMoney } from '../../backend/lib/money/index'
import { WHATSAPP_LINK } from '../data/products'
import { isSupabaseConfigured } from '../lib/supabase/client'

const ORDER_STATUS_LABEL = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  ready_for_pickup: 'Ready for pickup',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
}

const PAYMENT_METHOD_LABEL = { cod: 'Cash on Delivery', easypaisa: 'Easypaisa' }

/**
 * Reused for both the immediate post-checkout confirmation (/order-confirmation/:id)
 * and My Account order history detail (/account/orders/:id) — same data, same
 * read-only view; nothing about the presentation differs by entry point.
 */
export default function OrderConfirmation() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  const load = () => {
    if (!isSupabaseConfigured()) {
      setError('Order tracking is not available right now.')
      setLoading(false)
      return
    }
    setLoading(true)
    ordersApi
      .getOrder(id)
      .then(setOrder)
      .catch((err) => setError(err?.message ?? 'Could not load this order.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleCancel = async () => {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return
    setCancelling(true)
    try {
      setOrder(await ordersApi.cancelOrder(id))
    } catch (err) {
      // Safe to surface here: cancelOrder only runs once an order already
      // loaded successfully, so any error is a real server-side AppError
      // message (see backend/lib/errors), never the client config error
      // load() above guards against.
      setError(err?.message ?? 'Could not cancel this order. Please try again or contact support.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="container-aura py-16 text-center" aria-busy="true">
        <p className="text-ink-soft">Loading order...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container-aura py-16 text-center">
        <p className="mb-4">{error || 'Order not found.'}</p>
        <Link to="/shop" className="btn-outline inline-block w-auto px-8">Continue shopping</Link>
      </div>
    )
  }

  const canCancel = order.orderStatus === 'pending' || order.orderStatus === 'confirmed'
  const canRequestReturn = order.orderStatus === 'delivered'
  const supportMessage = `Hi SSzentronics! I have a question about my order ${order.orderNumber}.`

  return (
    <div className="container-aura py-10 md:py-14 max-w-2xl">
      <div className="text-center mb-8">
        <CheckCircle2 size={40} className="mx-auto mb-3" color="#102b26" />
        <h1 className="text-2xl md:text-3xl font-medium mb-2">Thank you for your order</h1>
        <p className="text-ink-soft">
          Order <span className="font-medium text-ink">{order.orderNumber}</span> — {ORDER_STATUS_LABEL[order.orderStatus] ?? order.orderStatus}
        </p>
      </div>

      <div className="bg-meta p-6 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-ink-soft">Payment method</span>
          <span>{PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}</span>
        </div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-ink-soft">Payment status</span>
          <span className="capitalize">{order.paymentStatus}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-soft">Delivery</span>
          <span className="capitalize">{order.deliveryMethod ?? 'standard'} delivery</span>
        </div>
      </div>

      <h2 className="font-medium mb-3">Items</h2>
      <div className="space-y-3 mb-6">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm border-b border-[#eee] pb-3">
            <span>{item.productName}{item.variantName ? ` — ${item.variantName}` : ''} × {item.quantity}</span>
            <span>{formatMoney(item.lineTotal, { currency: order.currency })}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2 mb-6">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotal, { currency: order.currency })}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Delivery</span>
          <span>{formatMoney(order.shippingTotal, { currency: order.currency })}</span>
        </div>
        <div className="flex justify-between font-medium text-base pt-2 border-t border-[#eee]">
          <span>Total</span>
          <span>{formatMoney(order.grandTotal, { currency: order.currency })}</span>
        </div>
      </div>

      <h2 className="font-medium mb-2">Shipping to</h2>
      <p className="text-sm text-ink-soft mb-6">
        {order.shippingAddress.recipientName}, {order.shippingAddress.addressLine1}
        {order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ''}, {order.shippingAddress.city}
        {order.shippingAddress.province ? `, ${order.shippingAddress.province}` : ''}
      </p>

      {error && <div className="form-banner form-banner-error mb-4">{error}</div>}

      <div className="flex flex-wrap gap-3">
        <a
          className="btn-outline w-auto px-6 inline-block text-center"
          href={`${WHATSAPP_LINK}?text=${encodeURIComponent(supportMessage)}`}
          target="_blank"
          rel="noreferrer"
        >
          Contact us about this order
        </a>
        {canCancel && (
          <button type="button" className="btn-outline w-auto px-6" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Cancel order'}
          </button>
        )}
        {canRequestReturn && (
          <Link to={`/account/orders/${order.id}/return`} className="btn-outline w-auto px-6 inline-block text-center">
            Request return
          </Link>
        )}
        <Link to="/shop" className="btn-lavender w-auto px-8 inline-block text-center">Continue shopping</Link>
      </div>
    </div>
  )
}
