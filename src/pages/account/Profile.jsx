import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { callEdgeFunction } from '../../lib/supabase/functions'
import { updateProfileSchema } from '../../../backend/lib/validation/index'

export default function Profile() {
  const { profile, customer, refreshProfile, user } = useAuth()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', marketingOptIn: false })
  const [fieldErrors, setFieldErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | saving | saved | error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setForm({
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
      phone: profile?.phone ?? customer?.phone ?? '',
      marketingOptIn: Boolean(customer?.marketingOptIn),
    })
  }, [profile, customer])

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFieldErrors({})
    setErrorMessage('')

    const result = updateProfileSchema.safeParse({
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      phone: form.phone || undefined,
      marketingOptIn: form.marketingOptIn,
    })
    if (!result.success) {
      const errors = {}
      for (const issue of result.error.issues) errors[issue.path[0]] = issue.message
      setFieldErrors(errors)
      return
    }

    setStatus('saving')
    try {
      await callEdgeFunction('auth/profile', { method: 'PATCH', body: result.data })
      await refreshProfile()
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err?.message ?? 'Could not save your changes. Please try again.')
    }
  }

  return (
    <div>
      <h2 className="text-xl font-medium font-display mb-6">Profile Details</h2>

      {status === 'saved' && <div className="form-banner form-banner-success">Your profile has been updated.</div>}
      {status === 'error' && <div className="form-banner form-banner-error">{errorMessage}</div>}

      <form onSubmit={handleSubmit} noValidate className="max-w-lg">
        <div className="form-field">
          <label className="form-label" htmlFor="account-email">
            Email
          </label>
          <input id="account-email" className="form-input" value={user?.email ?? ''} disabled readOnly />
          <p className="form-hint">Email changes are not supported yet — contact us on WhatsApp if you need help.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="form-field">
            <label className="form-label" htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              className="form-input"
              value={form.firstName}
              onChange={(e) => setField('firstName')(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              className="form-input"
              value={form.lastName}
              onChange={(e) => setField('lastName')(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="form-input"
            aria-invalid={Boolean(fieldErrors.phone)}
            value={form.phone}
            onChange={(e) => setField('phone')(e.target.value)}
            placeholder="03XXXXXXXXX"
          />
          {fieldErrors.phone && <p className="form-error">{fieldErrors.phone}</p>}
        </div>

        <label className="form-checkbox-row">
          <input
            type="checkbox"
            checked={form.marketingOptIn}
            onChange={(e) => setField('marketingOptIn')(e.target.checked)}
          />
          <span>Send me offers and updates from Aura Beauty Care.</span>
        </label>

        <button type="submit" className="btn-lavender" style={{ width: 'auto' }} disabled={status === 'saving'}>
          {status === 'saving' ? <span className="spinner" /> : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
