import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { checkoutSchema } from '../../backend/lib/validation/index'
import { deliveryCost } from '../../backend/lib/orders/index'
import { formatMoney, toMinorUnits } from '../../backend/lib/money/index'
import * as ordersApi from '../repositories/orders.repository'
import * as customersApi from '../repositories/customers.repository'
import { isSupabaseConfigured } from '../lib/supabase/client'

const STEPS = ['contact', 'address', 'delivery', 'payment', 'review']
const STEP_LABELS = { contact: 'Contact', address: 'Address', delivery: 'Delivery', payment: 'Payment', review: 'Review' }

const EMPTY_ADDRESS = {
  recipientName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'PK',
}

export default function Checkout() {
  const navigate = useNavigate()
  const { isAuthenticated, user, ensureGuestSession } = useAuth()
  const { items, total, loading: cartLoading, clearCart } = useCart()

  const [step, setStep] = useState('contact')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState(EMPTY_ADDRESS)
  const [savedAddresses, setSavedAddresses] = useState(null)
  const [selectedSavedId, setSelectedSavedId] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState('standard')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [customerNotes, setCustomerNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    ensureGuestSession().catch((err) => console.error('Failed to establish a checkout session.', err))
  }, [ensureGuestSession])

  useEffect(() => {
    if (!isSupabaseConfigured() || !isAuthenticated) return
    customersApi
      .listMyAddresses()
      .then((list) => {
        setSavedAddresses(list)
        const def = list.find((a) => a.isDefaultShipping) ?? list[0]
        if (def) {
          setSelectedSavedId(def.id)
          setAddress({
            recipientName: def.recipientName,
            phone: def.phone,
            addressLine1: def.addressLine1,
            addressLine2: def.addressLine2 ?? '',
            city: def.city,
            province: def.province ?? '',
            postalCode: def.postalCode ?? '',
            country: def.country,
          })
        }
      })
      .catch((err) => console.error('Failed to load saved addresses.', err))
  }, [isAuthenticated])

  const shippingTotal = deliveryCost(deliveryMethod)
  const grandTotal = toMinorUnits(total) + shippingTotal

  if (!isSupabaseConfigured() || (!cartLoading && items.length === 0)) {
    return <Navigate to="/cart" replace />
  }

  function selectSavedAddress(id) {
    setSelectedSavedId(id)
    const found = savedAddresses?.find((a) => a.id === id)
    if (found) {
      setAddress({
        recipientName: found.recipientName,
        phone: found.phone,
        addressLine1: found.addressLine1,
        addressLine2: found.addressLine2 ?? '',
        city: found.city,
        province: found.province ?? '',
        postalCode: found.postalCode ?? '',
        country: found.country,
      })
    }
  }

  function goTo(nextStep) {
    setErrors({})
    setStep(nextStep)
  }

  function validateContact() {
    if (!email.trim() && !phone.trim()) {
      setErrors({ email: 'Provide at least an email or phone number.' })
      return false
    }
    return true
  }

  function validateAddress() {
    const required = ['recipientName', 'phone', 'addressLine1', 'city']
    const fieldErrors = {}
    for (const key of required) {
      if (!address[key]?.trim()) fieldErrors[key] = 'Required'
    }
    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  function handleContinue() {
    if (step === 'contact' && validateContact()) goTo('address')
    else if (step === 'address' && validateAddress()) goTo('delivery')
    else if (step === 'delivery') goTo('payment')
    else if (step === 'payment') goTo('review')
  }

  async function handlePlaceOrder() {
    setSubmitError('')
    const input = {
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      shippingAddress: {
        ...address,
        addressLine2: address.addressLine2 || undefined,
        province: address.province || undefined,
        postalCode: address.postalCode || undefined,
        savedAddressId: isAuthenticated && selectedSavedId ? selectedSavedId : undefined,
      },
      deliveryMethod,
      paymentMethod,
      customerNotes: customerNotes.trim() || undefined,
      source: 'web',
    }

    const parsed = checkoutSchema.safeParse(input)
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Please check the details you entered.')
      return
    }

    setSubmitting(true)
    try {
      const order = await ordersApi.createOrder(parsed.data, idempotencyKey)
      await clearCart().catch(() => undefined) // server cart is already converted server-side; this just clears local state if needed
      navigate(`/order-confirmation/${order.id}`, { replace: true })
    } catch (err) {
      setSubmitError(err?.message ?? 'Could not place your order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="container-aura py-10 md:py-14">
      <h1 className="text-3xl font-medium mb-2">Checkout</h1>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft mb-8" aria-label="Checkout progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${i === stepIndex ? 'text-ink font-medium' : ''}`}>
            <span
              className="w-5 h-5 rounded-full grid place-items-center text-xs"
              style={{ background: i <= stepIndex ? '#102b26' : '#e8e8e8', color: i <= stepIndex ? '#fff' : '#666' }}
            >
              {i + 1}
            </span>
            {STEP_LABELS[s]}
            {i < STEPS.length - 1 && <span className="mx-1">›</span>}
          </li>
        ))}
      </ol>

      <div className="grid lg:grid-cols-[1fr_380px] gap-10">
        <div className="max-w-xl">
          {step === 'contact' && (
            <section>
              <h2 className="text-xl font-medium mb-4">Contact information</h2>
              {isAuthenticated && <p className="text-sm text-ink-soft mb-4">Signed in as {user?.email}</p>}
              <div className="form-field">
                <label className="form-label" htmlFor="email">Email</label>
                <input id="email" type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} />
                {errors.email && <p className="form-error">{errors.email}</p>}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="phone">Phone</label>
                <input id="phone" className="form-input" placeholder="03XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <button type="button" className="btn-lavender w-auto px-8" onClick={handleContinue}>Continue to address</button>
            </section>
          )}

          {step === 'address' && (
            <section>
              <h2 className="text-xl font-medium mb-4">Shipping address</h2>
              {isAuthenticated && savedAddresses?.length > 0 && (
                <div className="form-field">
                  <label className="form-label" htmlFor="savedAddress">Use a saved address</label>
                  <select id="savedAddress" className="form-input" value={selectedSavedId} onChange={(e) => selectSavedAddress(e.target.value)}>
                    <option value="">Enter a new address</option>
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label ? `${a.label} — ` : ''}{a.recipientName}, {a.city}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="form-field">
                  <label className="form-label" htmlFor="recipientName">Recipient name</label>
                  <input id="recipientName" className="form-input" aria-invalid={Boolean(errors.recipientName)} value={address.recipientName} onChange={(e) => setAddress((a) => ({ ...a, recipientName: e.target.value }))} />
                  {errors.recipientName && <p className="form-error">Required</p>}
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="addressPhone">Phone</label>
                  <input id="addressPhone" className="form-input" placeholder="03XXXXXXXXX" aria-invalid={Boolean(errors.phone)} value={address.phone} onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))} />
                  {errors.phone && <p className="form-error">Required</p>}
                </div>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="addressLine1">Address line 1</label>
                <input id="addressLine1" className="form-input" aria-invalid={Boolean(errors.addressLine1)} value={address.addressLine1} onChange={(e) => setAddress((a) => ({ ...a, addressLine1: e.target.value }))} />
                {errors.addressLine1 && <p className="form-error">Required</p>}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="addressLine2">Address line 2 (optional)</label>
                <input id="addressLine2" className="form-input" value={address.addressLine2} onChange={(e) => setAddress((a) => ({ ...a, addressLine2: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="form-field">
                  <label className="form-label" htmlFor="city">City</label>
                  <input id="city" className="form-input" aria-invalid={Boolean(errors.city)} value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
                  {errors.city && <p className="form-error">Required</p>}
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="province">Province</label>
                  <input id="province" className="form-input" value={address.province} onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="postalCode">Postal code</label>
                  <input id="postalCode" className="form-input" value={address.postalCode} onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-outline w-auto px-6" onClick={() => goTo('contact')}>Back</button>
                <button type="button" className="btn-lavender w-auto px-8" onClick={handleContinue}>Continue to delivery</button>
              </div>
            </section>
          )}

          {step === 'delivery' && (
            <section>
              <h2 className="text-xl font-medium mb-4">Delivery method</h2>
              <div className="space-y-3 mb-6">
                <DeliveryOption value="standard" selected={deliveryMethod} onSelect={setDeliveryMethod} label="Standard delivery" eta="3–5 business days" cost={deliveryCost('standard')} />
                <DeliveryOption value="express" selected={deliveryMethod} onSelect={setDeliveryMethod} label="Express delivery" eta="1–2 business days" cost={deliveryCost('express')} />
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-outline w-auto px-6" onClick={() => goTo('address')}>Back</button>
                <button type="button" className="btn-lavender w-auto px-8" onClick={handleContinue}>Continue to payment</button>
              </div>
            </section>
          )}

          {step === 'payment' && (
            <section>
              <h2 className="text-xl font-medium mb-4">Payment method</h2>
              <div className="space-y-3 mb-6">
                <PaymentOption value="cod" selected={paymentMethod} onSelect={setPaymentMethod} label="Cash on Delivery" description="Pay in cash when your order arrives." />
                <PaymentOption value="easypaisa" selected={paymentMethod} onSelect={setPaymentMethod} label="Easypaisa" description="Online payment via Easypaisa (coming soon — your order will be recorded as pending payment)." />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="notes">Order notes (optional)</label>
                <textarea id="notes" className="form-input" rows={3} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-outline w-auto px-6" onClick={() => goTo('delivery')}>Back</button>
                <button type="button" className="btn-lavender w-auto px-8" onClick={handleContinue}>Review order</button>
              </div>
            </section>
          )}

          {step === 'review' && (
            <section>
              <h2 className="text-xl font-medium mb-4">Review your order</h2>
              {submitError && <div className="form-banner form-banner-error mb-4">{submitError}</div>}
              <div className="space-y-4 mb-6 text-sm">
                <ReviewRow label="Contact" value={[email, phone].filter(Boolean).join(' · ')} onEdit={() => goTo('contact')} />
                <ReviewRow
                  label="Ship to"
                  value={`${address.recipientName}, ${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}, ${address.city}${address.province ? ', ' + address.province : ''}`}
                  onEdit={() => goTo('address')}
                />
                <ReviewRow label="Delivery" value={deliveryMethod === 'express' ? 'Express delivery' : 'Standard delivery'} onEdit={() => goTo('delivery')} />
                <ReviewRow label="Payment" value={paymentMethod === 'easypaisa' ? 'Easypaisa' : 'Cash on Delivery'} onEdit={() => goTo('payment')} />
              </div>
              <p className="text-xs text-ink-soft mb-4">No surprise charges — this is exactly what you'll be charged.</p>
              <button type="button" className="btn-lavender w-auto px-8" onClick={handlePlaceOrder} disabled={submitting}>
                {submitting ? <span className="spinner" /> : 'Place order'}
              </button>
            </section>
          )}
        </div>

        <aside className="bg-meta p-6 h-fit">
          <h2 className="text-lg font-medium mb-4">Order summary</h2>
          <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 text-sm">
                <img src={item.image} alt="" className="w-12 h-12 object-contain bg-white shrink-0" />
                <span className="flex-1">{item.name} × {item.qty}</span>
                <span>{formatMoney(toMinorUnits(item.price * item.qty))}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span>Subtotal</span>
            <span>{formatMoney(toMinorUnits(total))}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span>Delivery</span>
            <span>{formatMoney(shippingTotal)}</span>
          </div>
          <div className="flex justify-between font-medium text-base pt-2 border-t border-[#e0d9de]">
            <span>Total</span>
            <span>{formatMoney(grandTotal)}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

function DeliveryOption({ value, selected, onSelect, label, eta, cost }) {
  return (
    <label className="flex items-center justify-between border border-line px-4 py-3 cursor-pointer" style={selected === value ? { borderColor: '#102b26' } : undefined}>
      <span className="flex items-center gap-3">
        <input type="radio" name="delivery" checked={selected === value} onChange={() => onSelect(value)} />
        <span>
          <span className="block font-medium">{label}</span>
          <span className="block text-xs text-ink-soft">{eta}</span>
        </span>
      </span>
      <span className="font-medium">{formatMoney(cost)}</span>
    </label>
  )
}

function PaymentOption({ value, selected, onSelect, label, description }) {
  return (
    <label className="flex items-start gap-3 border border-line px-4 py-3 cursor-pointer" style={selected === value ? { borderColor: '#102b26' } : undefined}>
      <input type="radio" name="payment" checked={selected === value} onChange={() => onSelect(value)} className="mt-1" />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-ink-soft">{description}</span>
      </span>
    </label>
  )
}

function ReviewRow({ label, value, onEdit }) {
  return (
    <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#eee]">
      <div>
        <p className="text-ink-soft text-xs uppercase tracking-wide mb-1">{label}</p>
        <p>{value}</p>
      </div>
      <button type="button" className="text-xs underline shrink-0" onClick={onEdit}>Edit</button>
    </div>
  )
}
