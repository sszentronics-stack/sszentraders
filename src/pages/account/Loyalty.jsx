import { useEffect, useState } from 'react'
import * as loyaltyApi from '../../repositories/loyalty.repository'
import { isSupabaseConfigured } from '../../lib/supabase/client'

const ENTRY_LABEL = {
  earn: 'Earned',
  redeem: 'Redeemed',
  reversal: 'Reversed',
}

export default function Loyalty() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSummary({ balance: 0, history: [] })
      return
    }
    loyaltyApi
      .getMyLoyaltySummary()
      .then(setSummary)
      .catch((err) => setError(err?.message ?? 'Could not load your loyalty points.'))
  }, [])

  if (error) return <p className="text-ink-soft">{error}</p>
  if (summary === null) return <p className="text-ink-soft">Loading loyalty points...</p>

  return (
    <div>
      <h2 className="text-2xl font-medium font-display mb-6">Loyalty Points</h2>

      <div className="bg-meta p-6 mb-8">
        <p className="text-xs uppercase tracking-wide text-ink-soft mb-1">Your balance</p>
        <p className="text-4xl font-display font-medium">{summary.balance.toLocaleString()} pts</p>
        <p className="text-sm text-ink-soft mt-2">
          Worth Rs. {(summary.balance).toLocaleString()} off a future order. You earn 1 point for every Rs. 1 spent once an order is
          delivered, and can redeem points at checkout.
        </p>
      </div>

      <h3 className="text-lg font-medium mb-3">History</h3>
      {summary.history.length === 0 ? (
        <p className="text-ink-soft text-sm">No loyalty activity yet — place an order to start earning points.</p>
      ) : (
        <div className="space-y-3">
          {summary.history.map((entry) => (
            <div key={entry.id} className="address-card flex items-center justify-between">
              <div>
                <p className="font-medium">{ENTRY_LABEL[entry.entryType] ?? entry.entryType}</p>
                <p className="text-xs text-ink-soft">{entry.description}</p>
                <p className="text-xs text-ink-soft">{new Date(entry.createdAt).toLocaleDateString()}</p>
              </div>
              <p className={`font-medium ${entry.points > 0 ? 'text-green-700' : 'text-ink-soft'}`}>
                {entry.points > 0 ? '+' : ''}
                {entry.points.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
