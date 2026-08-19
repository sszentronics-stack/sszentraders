import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as ordersApi from '../../repositories/orders.repository'
import { formatMoney } from '../../../backend/lib/money/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'

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
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Order history is not available right now.')
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
        <h2 className="text-2xl font-medium font-display mb-3">No orders yet</h2>
        <p className="text-ink-soft max-w-md mx-auto mb-6">When you place an order, it will show up here.</p>
        <Link to="/shop" className="btn-lavender inline-block w-auto px-8">Browse products</Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-medium font-display mb-6">My Orders</h2>
      <div className="space-y-4">
        {orders.map((order) => (
          <Link key={order.id} to={`/account/orders/${order.id}`} className="address-card block">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{order.orderNumber}</span>
              <span className="address-badge">{ORDER_STATUS_LABEL[order.orderStatus] ?? order.orderStatus}</span>
            </div>
            <p className="text-sm text-ink-soft mb-1">{new Date(order.placedAt).toLocaleDateString()}</p>
            <p className="text-sm text-ink-soft mb-1">{order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
            <p className="font-medium">{formatMoney(order.grandTotal, { currency: order.currency })}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
