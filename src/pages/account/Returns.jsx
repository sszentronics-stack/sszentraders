import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as returnsApi from '../../repositories/returns.repository'
import { RETURN_STATUS_LABEL } from '../../repositories/returns.repository'
import { formatMoney } from '../../../backend/lib/money/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'

export default function Returns() {
  const [returns, setReturns] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Returns are not available right now.')
      return
    }
    returnsApi
      .listMyReturns()
      .then(setReturns)
      .catch((err) => setError(err?.message ?? 'Could not load your returns.'))
  }, [])

  if (error) {
    return <p className="text-ink-soft">{error}</p>
  }

  if (returns === null) {
    return <p className="text-ink-soft">Loading returns...</p>
  }

  if (returns.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-medium font-display mb-3">No returns yet</h2>
        <p className="text-ink-soft max-w-md mx-auto mb-6">
          Need to return something? Open a delivered order from My Orders and select "Request return".
        </p>
        <Link to="/account/orders" className="btn-lavender inline-block w-auto px-8">View orders</Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-medium font-display mb-6">My Returns</h2>
      <div className="space-y-4">
        {returns.map((ret) => (
          <Link key={ret.id} to={`/account/returns/${ret.id}`} className="address-card block">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{ret.returnNumber}</span>
              <span className="address-badge">{RETURN_STATUS_LABEL[ret.status] ?? ret.status}</span>
            </div>
            <p className="text-sm text-ink-soft mb-1">{new Date(ret.createdAt).toLocaleDateString()}</p>
            <p className="text-sm text-ink-soft mb-1">{ret.items.length} item{ret.items.length === 1 ? '' : 's'}</p>
            {ret.refundAmount != null && <p className="font-medium">{formatMoney(ret.refundAmount)}</p>}
          </Link>
        ))}
      </div>
    </div>
  )
}
