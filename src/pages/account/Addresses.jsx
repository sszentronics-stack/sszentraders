import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  createAddress,
  deleteAddress,
  listMyAddresses,
  setDefaultBillingAddress,
  setDefaultShippingAddress,
  updateAddress,
} from '../../repositories/customers.repository'
import { customerAddressSchema } from '../../../backend/lib/validation/index'
import { isSupabaseConfigured } from '../../lib/supabase/client'
import { deleteLocalAddress, loadLocalAddresses, saveLocalAddress, setLocalDefaultAddress } from '../../lib/localAccount'

const EMPTY_FORM = {
  label: '',
  recipientName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'PK',
  isDefaultShipping: false,
  isDefaultBilling: false,
}

function AddressForm({ initial, onCancel, onSaved, persist }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrors({})
    setError('')

    const result = customerAddressSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors = {}
      for (const issue of result.error.issues) fieldErrors[issue.path[0]] = issue.message
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      await persist(form.id, result.data)
      onSaved()
    } catch (err) {
      setError(err?.message ?? 'Could not save this address.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="address-card">
      {error && <div className="form-banner form-banner-error">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div className="form-field">
          <label className="form-label" htmlFor="label">
            Label
          </label>
          <input id="label" className="form-input" placeholder="Home, Office..." value={form.label} onChange={(e) => setField('label')(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="recipientName">
            Recipient name
          </label>
          <input
            id="recipientName"
            className="form-input"
            aria-invalid={Boolean(errors.recipientName)}
            value={form.recipientName}
            onChange={(e) => setField('recipientName')(e.target.value)}
          />
          {errors.recipientName && <p className="form-error">{errors.recipientName}</p>}
        </div>
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="phone">
          Phone
        </label>
        <input
          id="phone"
          className="form-input"
          placeholder="03XXXXXXXXX"
          aria-invalid={Boolean(errors.phone)}
          value={form.phone}
          onChange={(e) => setField('phone')(e.target.value)}
        />
        {errors.phone && <p className="form-error">{errors.phone}</p>}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="addressLine1">
          Address line 1
        </label>
        <input
          id="addressLine1"
          className="form-input"
          aria-invalid={Boolean(errors.addressLine1)}
          value={form.addressLine1}
          onChange={(e) => setField('addressLine1')(e.target.value)}
        />
        {errors.addressLine1 && <p className="form-error">{errors.addressLine1}</p>}
      </div>

      <div className="form-field">
        <label className="form-label" htmlFor="addressLine2">
          Address line 2 (optional)
        </label>
        <input id="addressLine2" className="form-input" value={form.addressLine2} onChange={(e) => setField('addressLine2')(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="form-field">
          <label className="form-label" htmlFor="city">
            City
          </label>
          <input id="city" className="form-input" aria-invalid={Boolean(errors.city)} value={form.city} onChange={(e) => setField('city')(e.target.value)} />
          {errors.city && <p className="form-error">{errors.city}</p>}
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="province">
            Province
          </label>
          <input id="province" className="form-input" value={form.province} onChange={(e) => setField('province')(e.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="postalCode">
            Postal code
          </label>
          <input id="postalCode" className="form-input" value={form.postalCode} onChange={(e) => setField('postalCode')(e.target.value)} />
        </div>
      </div>

      <label className="form-checkbox-row">
        <input type="checkbox" checked={form.isDefaultShipping} onChange={(e) => setField('isDefaultShipping')(e.target.checked)} />
        <span>Set as default shipping address</span>
      </label>
      <label className="form-checkbox-row">
        <input type="checkbox" checked={form.isDefaultBilling} onChange={(e) => setField('isDefaultBilling')(e.target.checked)} />
        <span>Set as default billing address</span>
      </label>

      <div className="flex gap-3">
        <button type="submit" className="btn-lavender" style={{ width: 'auto' }} disabled={submitting}>
          {submitting ? <span className="spinner" /> : 'Save Address'}
        </button>
        <button type="button" className="btn-outline" style={{ width: 'auto' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function Addresses() {
  const [addresses, setAddresses] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | address object
  const [busyId, setBusyId] = useState(null)

  const local = !isSupabaseConfigured()

  async function persist(id, data) {
    if (local) {
      saveLocalAddress(id, data)
      return
    }
    if (id) await updateAddress(id, data)
    else await createAddress(data)
  }

  const load = async () => {
    try {
      setError('')
      setAddresses(local ? loadLocalAddresses() : await listMyAddresses())
    } catch (err) {
      setError(err?.message ?? 'Could not load your addresses.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSaved = () => {
    setEditing(null)
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this address?')) return
    setBusyId(id)
    try {
      if (local) deleteLocalAddress(id)
      else await deleteAddress(id)
      await load()
    } catch (err) {
      setError(err?.message ?? 'Could not delete this address.')
    } finally {
      setBusyId(null)
    }
  }

  const handleSetDefault = async (id, kind) => {
    setBusyId(id)
    try {
      if (local) setLocalDefaultAddress(id, kind)
      else if (kind === 'shipping') await setDefaultShippingAddress(id)
      else await setDefaultBillingAddress(id)
      await load()
    } catch (err) {
      setError(err?.message ?? 'Could not update default address.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-medium font-display">Saved Addresses</h2>
        {editing === null && (
          <button type="button" className="btn-outline flex items-center gap-2" style={{ width: 'auto' }} onClick={() => setEditing('new')}>
            <Plus size={16} /> Add Address
          </button>
        )}
      </div>

      {error && <div className="form-banner form-banner-error">{error}</div>}

      {editing === 'new' && <AddressForm persist={persist} onCancel={() => setEditing(null)} onSaved={handleSaved} />}
      {editing && editing !== 'new' && (
        <AddressForm persist={persist} initial={editing} onCancel={() => setEditing(null)} onSaved={handleSaved} />
      )}

      {editing === null && addresses === null && <p className="text-ink-soft">Loading addresses...</p>}
      {editing === null && addresses?.length === 0 && (
        <p className="text-ink-soft">You have not saved any addresses yet.</p>
      )}
      {editing === null &&
        addresses?.map((address) => (
          <div key={address.id} className="address-card">
            <div className="address-card-badges">
              {address.isDefaultShipping && <span className="address-badge">Default Shipping</span>}
              {address.isDefaultBilling && <span className="address-badge">Default Billing</span>}
              {address.label && <span className="address-badge">{address.label}</span>}
            </div>
            <p className="font-medium">{address.recipientName}</p>
            <p className="text-sm text-ink-soft">{address.phone}</p>
            <p className="text-sm text-ink-soft">
              {address.addressLine1}
              {address.addressLine2 ? `, ${address.addressLine2}` : ''}
            </p>
            <p className="text-sm text-ink-soft">
              {[address.city, address.province, address.postalCode].filter(Boolean).join(', ')}
            </p>
            <div className="address-card-actions">
              <button type="button" onClick={() => setEditing(address)} disabled={busyId === address.id}>
                Edit
              </button>
              {!address.isDefaultShipping && (
                <button type="button" onClick={() => handleSetDefault(address.id, 'shipping')} disabled={busyId === address.id}>
                  Set as default shipping
                </button>
              )}
              {!address.isDefaultBilling && (
                <button type="button" onClick={() => handleSetDefault(address.id, 'billing')} disabled={busyId === address.id}>
                  Set as default billing
                </button>
              )}
              <button type="button" onClick={() => handleDelete(address.id)} disabled={busyId === address.id}>
                Delete
              </button>
            </div>
          </div>
        ))}
    </div>
  )
}
