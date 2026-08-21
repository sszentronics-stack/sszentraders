import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatMoney } from '../../../backend/lib/money/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import * as returnsApi from '../../repositories/returns.repository'
import { RETURN_STATUS_LABEL } from '../../repositories/returns.repository'

const REASON_LABEL = returnsApi.RETURN_REASON_LABELS

export default function ReturnDetail() {
  const { id } = useParams()
  const [ret, setRet] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Return tracking is not available right now.')
      return
    }
    returnsApi
      .getReturn(id)
      .then(setRet)
      .catch((err) => setError(err?.message ?? 'Could not load this return.'))
  }, [id])

  if (error || (ret === null && error !== '')) {
    return (
      <div className="container-aura py-16 text-center">
        <p className="mb-4">{error || 'Return not found.'}</p>
        <Link to="/account/returns" className="btn-outline inline-block w-auto px-8">Back to returns</Link>
      </div>
    )
  }

  if (!ret) {
    return (
      <div className="container-aura py-16 text-center">
        <p className="text-ink-soft">Loading...</p>
      </div>
    )
  }

  return (
    <div className="container-aura py-10 md:py-14 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-medium mb-2">Return {ret.returnNumber}</h1>
        <p className="text-ink-soft">Status: <span className="text-ink font-medium">{RETURN_STATUS_LABEL[ret.status] ?? ret.status}</span></p>
      </div>

      <h2 className="font-medium mb-3">Items</h2>
      <div className="space-y-3 mb-6">
        {ret.items.map((item) => (
          <div key={item.id} className="border-b border-[#eee] pb-3 text-sm">
            <p>Quantity: {item.quantity}</p>
            {item.reasonCode && <p className="text-ink-soft">Reason: {REASON_LABEL[item.reasonCode] ?? item.reasonCode}</p>}
            {item.reason && <p className="text-ink-soft">Notes: {item.reason}</p>}
            {item.evidenceCount > 0 && <p className="text-ink-soft">{item.evidenceCount} photo(s) attached</p>}
          </div>
        ))}
      </div>

      {(ret.resolution || ret.refundAmount != null) && (
        <div className="bg-meta p-6 mb-6">
          {ret.resolution && (
            <div className="flex justify-between text-sm mb-2">
              <span className="text-ink-soft">Resolution</span>
              <span className="capitalize">{ret.resolution}</span>
            </div>
          )}
          {ret.resolution === 'refund' && ret.refundAmount != null && (
            <div className="flex justify-between text-sm mb-2">
              <span className="text-ink-soft">Refund amount</span>
              <span>{formatMoney(ret.refundAmount)}</span>
            </div>
          )}
          {ret.refundMethod && (
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Refund method</span>
              <span className="capitalize">{ret.refundMethod === 'easypaisa' ? 'Easypaisa' : 'Manual / bank transfer'}</span>
            </div>
          )}
        </div>
      )}

      <h2 className="font-medium mb-3">Status timeline</h2>
      <div className="space-y-3 mb-6">
        {ret.events.map((event) => (
          <div key={event.id} className="flex justify-between text-sm border-b border-[#eee] pb-3">
            <div>
              <span className="font-medium">{RETURN_STATUS_LABEL[event.toStatus] ?? event.toStatus}</span>
              {event.note && <p className="text-ink-soft">{event.note}</p>}
            </div>
            <span className="text-ink-soft whitespace-nowrap">{new Date(event.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      <Link to="/account/returns" className="btn-outline inline-block w-auto px-6 text-center">Back to returns</Link>
    </div>
  )
}
