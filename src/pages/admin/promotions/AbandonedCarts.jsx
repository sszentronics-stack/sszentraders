import { useEffect, useState } from 'react'
import * as promotionsApi from '../../../repositories/promotions.repository'
import { formatMoney } from '../../../../backend/lib/money/index'

export default function AbandonedCarts() {
  const [days, setDays] = useState(3)
  const [carts, setCarts] = useState(null)
  const [error, setError] = useState('')

  function load(d) {
    promotionsApi
      .listAbandonedCarts(d)
      .then(setCarts)
      .catch((err) => setError(err?.message ?? 'Failed to load abandoned carts.'))
  }

  useEffect(() => load(days), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h2 className="text-xl font-medium mb-2">Abandoned Carts</h2>
      <p className="text-sm text-ink-soft mb-4">
        Active carts with items, untouched for the selected number of days. This is a data view only — no email/SMS/notification is
        sent from here (no configured channel exists yet).
      </p>
      {error && <div className="form-banner form-banner-error mb-4">{error}</div>}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm" htmlFor="days">Inactive for at least</label>
        <input
          id="days"
          type="number"
          min="1"
          className="form-input w-20"
          value={days}
          onChange={(e) => {
            const v = Number(e.target.value) || 1
            setDays(v)
            load(v)
          }}
        />
        <span className="text-sm">days</span>
      </div>
      {carts === null ? (
        <p className="text-ink-soft">Loading...</p>
      ) : carts.length === 0 ? (
        <p className="text-ink-soft text-sm">No abandoned carts matching this window.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft border-b border-line">
              <th className="py-2">Cart</th>
              <th>Items</th>
              <th>Estimated value</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {carts.map((c) => (
              <tr key={c.cartId} className="border-b border-[#eee]">
                <td className="py-2 font-mono text-xs">{c.cartId.slice(0, 8)}</td>
                <td>{c.itemCount}</td>
                <td>{formatMoney(c.subtotalHint)}</td>
                <td>{new Date(c.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
