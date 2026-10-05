import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as ordersApi from '../../repositories/orders.repository'
import { formatMoney } from '../../../backend/lib/money/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { useCart } from '../../context/CartContext'

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

export default function Orders() {
  const navigate = useNavigate()
  const { reorder } = useCart()
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')
  const [reorderingId, setReorderingId] = useState(null)
  const [reorderNotice, setReorderNotice] = useState('')

  async function handleReorder(e, orderId) {
    e.preventDefault()
    e.stopPropagation()
    setReorderNotice('')
    setReorderingId(orderId)
    try {
      const { addedCount, skipped } = await reorder(orderId)
      if (addedCount === 0) {
        setReorderNotice('None of the items from this order are available to reorder right now.')
      } else if (skipped.length > 0) {
        setReorderNotice(`Added ${addedCount} item${addedCount === 1 ? '' : 's'} to your cart. ${skipped.length} item${skipped.length === 1 ? '' : 's'} could not be re-added (no longer available).`)
        navigate('/cart')
      } else {
        navigate('/cart')
      }
    } catch (err) {
      setReorderNotice(err?.message ?? 'Could not reorder — please try again.')
    } finally {
      setReorderingId(null)
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setOrders([])
      return
    }
    ordersApi
      .listMyOrders()
      .then(setOrders)
      .catch((err) => setError(err?.message ?? 'Could not load your orders.'))
  }, [])

  if (error) {
    return <p className="text-ink-soft">{error}</p>
  }

  if (orders === null) {
    return <p className="text-ink-soft">Loading orders...</p>
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="h3 mb-3">No orders yet</h2>
        <p className="text-secondary mb-4">WhatsApp orders are confirmed by our team. Once an order is placed on your account, the number, status, and total show up here.</p>
        <Link to="/shop" className="btn btn-dark">Browse the shop</Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-medium font-display mb-6">My Orders</h2>
      {reorderNotice && <div className="form-banner mb-4">{reorderNotice}</div>}
      <div className="space-y-4">
        {orders.map((order) => (
          <Link key={order.id} to={`/account/orders/${order.id}`} className="address-card block">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{order.orderNumber}</span>
              <span className="address-badge">{ORDER_STATUS_LABEL[order.orderStatus] ?? order.orderStatus}</span>
            </div>
            <p className="text-sm text-ink-soft mb-1">{new Date(order.placedAt).toLocaleDateString()}</p>
            <p className="text-sm text-ink-soft mb-1">{order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
            <div className="flex items-center justify-between">
              <p className="font-medium">{formatMoney(order.grandTotal, { currency: order.currency })}</p>
              <button
                type="button"
                className="text-xs underline"
                disabled={reorderingId === order.id}
                onClick={(e) => handleReorder(e, order.id)}
              >
                {reorderingId === order.id ? 'Adding…' : 'Reorder'}
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
