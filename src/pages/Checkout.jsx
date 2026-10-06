import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { checkoutSchema } from '../../backend/lib/validation/index'
import { deliveryCost } from '../../backend/lib/orders/index'
import { formatMoney, toMinorUnits } from '../../backend/lib/money/index'
import * as ordersApi from '../repositories/orders.repository'
import * as customersApi from '../repositories/customers.repository'
import * as promotionsApi from '../repositories/promotions.repository'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { callEdgeFunction } from '../lib/supabase/functions'
import { addressIsComplete, knownCustomer, rememberLocalCheckout } from '../lib/customerDetails'
import { findInfluencerCode, quoteInfluencerCode, recordInfluencerRedemption, setAppliedInfluencerPromo } from '../lib/influencerCodes'
import { useSeo } from '../hooks/useSeo'

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
  useSeo({ title: 'Checkout | SSzentronics', noindex: true })
  const navigate = useNavigate()
  const { isAuthenticated, user, profile, customer, initializing, identityReady, ensureGuestSession, refreshProfile } = useAuth()
  const { items, total, loading: cartLoading, clearCart } = useCart()

  const [step, setStep] = useState('contact')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState(EMPTY_ADDRESS)
  const [savedAddresses, setSavedAddresses] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const userEdited = useRef(false)
  const stepped = useRef(false)
  const [selectedSavedId, setSelectedSavedId] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState('standard')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [customerNotes, setCustomerNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // Phase 13: coupon + loyalty-points redemption. Everything shown here
  // (discount amount, eligibility reasons, redeemable point count) is a
  // literal echo of the server's own computation (promotions/preview Edge
  // Function route) — never assembled client-side — so what's shown always
  // matches what createOrder() will actually apply.
  const [couponCodeInput, setCouponCodeInput] = useState('')
  const [couponPreview, setCouponPreview] = useState(null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [redeemPointsChecked, setRedeemPointsChecked] = useState(false)
  const [loyaltyPreview, setLoyaltyPreview] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    promotionsApi
      .previewDiscount()
      .then(setLoyaltyPreview)
      .catch(() => undefined)
  }, [])

  async function checkCoupon() {
    if (!couponCodeInput.trim()) {
      setCouponPreview(null)
      return
    }
    setCouponChecking(true)
    const typed = couponCodeInput.trim()
    const customerPhone = phone.trim() || address.phone
    try {
      if (findInfluencerCode(typed)) {
        const local = quoteInfluencerCode(typed, total, customerPhone)
        setCouponPreview(local)
        if (local.eligible) {
          setAppliedInfluencerPromo({
            code: local.couponCode,
            phone: customerPhone,
            phoneKey: local.phoneKey,
            influencerName: local.promotionName,
            discountType: local.discountType,
            discountValue: local.discountValue,
          })
        }
        return
      }
      let preview = null
      if (isSupabaseConfigured()) {
        preview = await promotionsApi.previewDiscount(typed)
      }
      setCouponPreview(preview ?? { eligible: false, reasons: ['This coupon could not be applied.'], discountAmount: 0, freeShipping: false })
    } catch (err) {
      const local = quoteInfluencerCode(typed, total, customerPhone)
      setCouponPreview(
        local.eligible
          ? local
          : { eligible: false, reasons: [err?.message ?? 'Could not check this coupon.'], discountAmount: 0, freeShipping: false },
      )
    } finally {
      setCouponChecking(false)
    }
  }

  // No coupon typed: fall back to whatever automatic promotion (if any) the
  // no-code preview found, so the customer still sees savings they didn't
  // have to ask for.
  const activePromotion = couponPreview ?? loyaltyPreview
  const appliedDiscount = activePromotion?.eligible ? activePromotion.discountAmount : 0
  const appliedFreeShipping = activePromotion?.eligible ? activePromotion.freeShipping : false
  const redeemablePoints = loyaltyPreview?.maxRedeemablePoints ?? 0
  const loyaltyDiscount = redeemPointsChecked ? redeemablePoints * 100 : 0

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    ensureGuestSession().catch((err) => console.error('Failed to establish a checkout session.', err))
  }, [ensureGuestSession])

  useEffect(() => {
    if (initializing || (isAuthenticated && !identityReady)) return undefined
    if (!isSupabaseConfigured() || !isAuthenticated) {
      setSavedAddresses((current) => current ?? [])
      return undefined
    }
    let cancelled = false
    customersApi
      .listMyAddresses()
      .then((list) => {
        if (!cancelled) setSavedAddresses(list)
      })
      .catch((err) => {
        console.error('Failed to load saved addresses.', err)
        if (!cancelled) setSavedAddresses([])
      })
    return () => {
      cancelled = true
    }
  }, [initializing, identityReady, isAuthenticated])

  useEffect(() => {
    if (initializing || (isAuthenticated && (!identityReady || savedAddresses === null))) return
    const known = knownCustomer({ profile, customer, user })
    const def = (savedAddresses ?? []).find((row) => row.isDefaultShipping) ?? (savedAddresses ?? [])[0]
    if (!userEdited.current) {
      setEmail((current) => current || known.email)
      setPhone((current) => current || def?.phone || known.phone)
      if (def) setSelectedSavedId((current) => current || def.id)
      setAddress((current) => ({
        recipientName: current.recipientName || def?.recipientName || known.name,
        phone: current.phone || def?.phone || known.phone,
        addressLine1: current.addressLine1 || def?.addressLine1 || known.addressLine1,
        addressLine2: current.addressLine2 || def?.addressLine2 || known.addressLine2,
        city: current.city || def?.city || known.city,
        province: current.province || def?.province || known.province,
        postalCode: current.postalCode || def?.postalCode || known.postalCode,
        country: current.country || def?.country || 'PK',
      }))
    }
    if (!stepped.current && !userEdited.current) {
      const nextAddress = {
        recipientName: def?.recipientName || known.name,
        phone: def?.phone || known.phone,
        addressLine1: def?.addressLine1 || known.addressLine1,
        city: def?.city || known.city,
      }
      const contactReady = Boolean(known.email && nextAddress.phone)
      if (addressIsComplete(nextAddress)) setStep('delivery')
      else if (contactReady) setStep('address')
      stepped.current = true
    }
    setHydrated(true)
  }, [initializing, identityReady, isAuthenticated, savedAddresses, profile, customer, user])

  const baseShippingTotal = deliveryCost(deliveryMethod)
  const shippingTotal = appliedFreeShipping ? 0 : baseShippingTotal
  const discountTotal = appliedDiscount + loyaltyDiscount
  const grandTotal = Math.max(toMinorUnits(total) - discountTotal, 0) + shippingTotal

  if (!isSupabaseConfigured() || (!cartLoading && items.length === 0)) {
    return <Navigate to="/cart" replace />
  }

  function selectSavedAddress(id) {
    userEdited.current = true
    setSelectedSavedId(id)
    const found = savedAddresses?.find((a) => a.id === id)
    if (found) {
      setPhone(found.phone)
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

  function editPhone(value) {
    userEdited.current = true
    setPhone(value)
    setAddress((current) => ({ ...current, phone: value }))
  }

  function editAddress(key) {
    return (value) => {
      userEdited.current = true
      setAddress((current) => ({ ...current, [key]: value }))
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
    const phoneValue = phone.trim() || address.phone.trim()
    const next = { ...address, phone: phoneValue }
    if (phoneValue !== address.phone) setAddress(next)
    const required = ['recipientName', 'phone', 'addressLine1', 'city']
    const fieldErrors = {}
    for (const key of required) {
      if (!next[key]?.trim()) fieldErrors[key] = 'Required'
    }
    setErrors(fieldErrors)
    return Object.keys(fieldErrors).length === 0
  }

  function handleContinue() {
    if (step === 'contact' && validateContact()) {
      setAddress((current) => ({ ...current, phone: phone.trim() || current.phone }))
      goTo('address')
    } else if (step === 'address' && validateAddress()) goTo('delivery')
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
      couponCode: couponPreview?.eligible ? couponPreview.couponCode ?? couponCodeInput.trim() : undefined,
      redeemPoints: redeemPointsChecked && redeemablePoints > 0 ? redeemablePoints : undefined,
    }

    const parsed = checkoutSchema.safeParse(input)
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Please check the details you entered.')
      return
    }

    const customerPhone = phone.trim() || address.phone
    if (findInfluencerCode(couponPreview?.couponCode)) {
      const gate = quoteInfluencerCode(couponPreview.couponCode, total, customerPhone)
      if (!gate.eligible) {
        setSubmitError(gate.reasons[0])
        return
      }
    }

    setSubmitting(true)
    try {
      const order = await ordersApi.createOrder(parsed.data, idempotencyKey)
      if (findInfluencerCode(couponPreview?.couponCode)) {
        recordInfluencerRedemption(couponPreview.couponCode, customerPhone)
      }
      rememberLocalCheckout({
        name: address.recipientName,
        phone: customerPhone,
        city: address.city,
        address: address.addressLine1,
        addressLine2: address.addressLine2,
        province: address.province,
        postalCode: address.postalCode,
      })
      if (isAuthenticated) {
        try {
          if (!selectedSavedId && address.recipientName && address.addressLine1 && address.city && customerPhone) {
            await customersApi.createAddress({
              label: 'Home',
              recipientName: address.recipientName,
              phone: customerPhone,
              addressLine1: address.addressLine1,
              addressLine2: address.addressLine2 || undefined,
              city: address.city,
              province: address.province || undefined,
              postalCode: address.postalCode || undefined,
              country: address.country || 'PK',
              isDefaultShipping: true,
            })
          }
          if (!(profile?.phone || customer?.phone) && customerPhone) {
            await callEdgeFunction('auth/profile', { method: 'PATCH', body: { phone: customerPhone } })
            await refreshProfile()
          }
        } catch (err) {
          console.error('Could not save details for next time.', err)
        }
      }
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
          {!hydrated ? (
            <p className="text-ink-soft">Loading your details...</p>
          ) : null}
          {hydrated && (step === 'delivery' || step === 'payment') && (email || phone || address.addressLine1) && (
            <div className="border border-[#e8e8e8] p-4 mb-6 text-sm">
              {address.recipientName && <p>{address.recipientName}</p>}
              <p>{[email, phone || address.phone].filter(Boolean).join(' · ')}</p>
              {address.addressLine1 && <p>{address.addressLine1}{address.city ? `, ${address.city}` : ''}</p>}
              <div className="flex gap-4 mt-2">
                <button type="button" className="underline" onClick={() => goTo('contact')}>Edit contact</button>
                <button type="button" className="underline" onClick={() => goTo('address')}>Edit address</button>
              </div>
            </div>
          )}
          {hydrated && step === 'contact' && (
            <section>
              <h2 className="text-xl font-medium mb-4">Contact information</h2>
              {isAuthenticated && <p className="text-sm text-ink-soft mb-4">Signed in as {user?.email}</p>}
              <div className="form-field">
                <label className="form-label" htmlFor="email">Email</label>
                <input id="email" type="email" className="form-input" value={email} onChange={(e) => { userEdited.current = true; setEmail(e.target.value) }} aria-invalid={Boolean(errors.email)} autoComplete="email" />
                {errors.email && <p className="form-error">{errors.email}</p>}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="phone">Phone</label>
                <input id="phone" className="form-input" placeholder="03XXXXXXXXX" value={phone} onChange={(e) => editPhone(e.target.value)} autoComplete="tel" />
              </div>
              <button type="button" className="btn-lavender w-auto px-8" onClick={handleContinue}>Continue to address</button>
            </section>
          )}

          {hydrated && step === 'address' && (
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
                  <input id="recipientName" className="form-input" aria-invalid={Boolean(errors.recipientName)} value={address.recipientName} onChange={(e) => editAddress('recipientName')(e.target.value)} autoComplete="name" />
                  {errors.recipientName && <p className="form-error">Required</p>}
                </div>
                <div className="form-field">
                  <p className="form-label">Phone</p>
                  {phone || address.phone ? (
                    <p className="text-sm">{phone || address.phone} <button type="button" className="underline" onClick={() => goTo('contact')}>Change</button></p>
                  ) : (
                    <input id="addressPhone" className="form-input" placeholder="03XXXXXXXXX" aria-invalid={Boolean(errors.phone)} value={phone} onChange={(e) => editPhone(e.target.value)} autoComplete="tel" />
                  )}
                  {errors.phone && <p className="form-error">Required</p>}
                </div>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="addressLine1">Address line 1</label>
                <input id="addressLine1" className="form-input" aria-invalid={Boolean(errors.addressLine1)} value={address.addressLine1} onChange={(e) => editAddress('addressLine1')(e.target.value)} autoComplete="address-line1" />
                {errors.addressLine1 && <p className="form-error">Required</p>}
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="addressLine2">Address line 2 (optional)</label>
                <input id="addressLine2" className="form-input" value={address.addressLine2} onChange={(e) => editAddress('addressLine2')(e.target.value)} autoComplete="address-line2" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="form-field">
                  <label className="form-label" htmlFor="city">City</label>
                  <input id="city" className="form-input" aria-invalid={Boolean(errors.city)} value={address.city} onChange={(e) => editAddress('city')(e.target.value)} autoComplete="address-level2" />
                  {errors.city && <p className="form-error">Required</p>}
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="province">Province</label>
                  <input id="province" className="form-input" value={address.province} onChange={(e) => editAddress('province')(e.target.value)} autoComplete="address-level1" />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="postalCode">Postal code</label>
                  <input id="postalCode" className="form-input" value={address.postalCode} onChange={(e) => editAddress('postalCode')(e.target.value)} autoComplete="postal-code" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" className="btn-outline w-auto px-6" onClick={() => goTo('contact')}>Back</button>
                <button type="button" className="btn-lavender w-auto px-8" onClick={handleContinue}>Continue to delivery</button>
              </div>
            </section>
          )}

          {hydrated && step === 'delivery' && (
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

          {hydrated && step === 'payment' && (
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

          {hydrated && step === 'review' && (
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
          <div className="form-field">
            <label className="form-label" htmlFor="coupon">Coupon code</label>
            <div className="flex gap-2">
              <input
                id="coupon"
                className="form-input"
                placeholder="e.g. WELCOME10"
                value={couponCodeInput}
                onChange={(e) => {
                  setCouponCodeInput(e.target.value)
                  setCouponPreview(null)
                }}
              />
              <button type="button" className="btn-outline w-auto px-4" onClick={checkCoupon} disabled={couponChecking}>
                {couponChecking ? '...' : 'Apply'}
              </button>
            </div>
            {couponPreview && !couponPreview.eligible && couponPreview.reasons.length > 0 && (
              <p className="form-error">{couponPreview.reasons[0]}</p>
            )}
            {couponPreview?.eligible && (
              <p className="text-xs mt-1" style={{ color: '#1c7a3c' }}>
                {couponPreview.freeShipping ? 'Free shipping applied!' : `Rs. ${(couponPreview.discountAmount / 100).toLocaleString()} off applied!`}
              </p>
            )}
          </div>

          {redeemablePoints > 0 && (
            <label className="flex items-start gap-2 text-sm mb-4 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={redeemPointsChecked} onChange={(e) => setRedeemPointsChecked(e.target.checked)} />
              <span>
                Redeem {redeemablePoints.toLocaleString()} loyalty points for Rs. {redeemablePoints.toLocaleString()} off
                {loyaltyPreview?.loyaltyBalance ? ` (balance: ${loyaltyPreview.loyaltyBalance.toLocaleString()} pts)` : ''}
              </span>
            </label>
          )}

          <div className="flex justify-between text-sm mb-2">
            <span>Subtotal</span>
            <span>{formatMoney(toMinorUnits(total))}</span>
          </div>
          {discountTotal > 0 && (
            <div className="flex justify-between text-sm mb-2" style={{ color: '#1c7a3c' }}>
              <span>Discount</span>
              <span>-{formatMoney(discountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm mb-2">
            <span>Delivery</span>
            <span>{appliedFreeShipping ? <span style={{ color: '#1c7a3c' }}>Free</span> : formatMoney(shippingTotal)}</span>
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
