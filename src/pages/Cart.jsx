import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { buildWhatsAppOrder, formatPKR } from '../data/products'
import { orderCustomer, useSiteContent } from '../lib/siteContent'
import { knownCustomer, rememberLocalCheckout } from '../lib/customerDetails'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { getAppliedInfluencerPromo, normalizePhone, quoteInfluencerCode, recordInfluencerRedemption, setAppliedInfluencerPromo } from '../lib/influencerCodes'
import { useSeo } from '../hooks/useSeo'

export default function Cart() {
  useSeo({ title: 'Your cart | SS Zen Traders', noindex: true })
  const content = useSiteContent()
  const { profile, customer, user } = useAuth()
  const configured = isSupabaseConfigured()
  const navigate = useNavigate()
  const { items, total, loading, updateQty, removeItem, clearCart, removedNotice, dismissRemovedNotice } = useCart()
  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '' })
  const [editingPhone, setEditingPhone] = useState(false)
  const [promoInput, setPromoInput] = useState('')
  const [promo, setPromo] = useState(null)
  const [promoError, setPromoError] = useState('')

  const discount = promo?.discountMajor || 0
  const due = Math.max(total - discount, 0)

  function applyPromo() {
    const quote = quoteInfluencerCode(promoInput, total, form.phone)
    if (!quote.eligible) {
      setPromo(null)
      setAppliedInfluencerPromo(null)
      setPromoError(quote.reasons[0] || 'This code cannot be applied.')
      return
    }
    setPromoError('')
    setPromo(quote)
    setAppliedInfluencerPromo({
      code: quote.couponCode,
      phone: form.phone.trim(),
      phoneKey: quote.phoneKey,
      influencerName: quote.promotionName,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
    })
  }

  const known = knownCustomer({ profile, customer, user })

  useEffect(() => {
    const applied = getAppliedInfluencerPromo()
    if (applied?.code) setPromoInput(applied.code)
    setForm((current) => ({
      name: current.name || known.name,
      phone: current.phone || known.phone,
      city: current.city || known.city,
      address: current.address || known.addressLine1,
    }))
  }, [known.name, known.phone, known.city, known.addressLine1])

  function rememberDetails() {
    rememberLocalCheckout({
      name: form.name,
      phone: form.phone,
      city: form.city,
      address: form.address,
    })
  }

  useEffect(() => {
    const applied = getAppliedInfluencerPromo()
    if (!applied?.code || promo?.couponCode) return
    if (!normalizePhone(form.phone || applied.phone)) return
    const quote = quoteInfluencerCode(applied.code, total, form.phone || applied.phone)
    if (!quote.eligible) return
    setPromoError('')
    setPromo(quote)
  }, [total, form.phone, promo?.couponCode])

  useEffect(() => {
    if (!promo?.couponCode) return
    if (!normalizePhone(form.phone)) return
    const quote = quoteInfluencerCode(promo.couponCode, total, form.phone)
    if (!quote.eligible) {
      setPromo(null)
      setAppliedInfluencerPromo(null)
      setPromoError(quote.reasons[0] || 'This code can no longer be applied.')
      return
    }
    if (quote.discountMajor !== promo.discountMajor) setPromo(quote)
  }, [total, form.phone, promo?.couponCode, promo?.discountMajor])

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  if (loading && items.length === 0) {
    return (
      <div className="ssz-section">
        <div className="ssz-container ssz-empty">
          <h1>Loading cart</h1>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="ssz-section">
        <div className="ssz-container ssz-empty">
          <h1>Your cart is empty</h1>
          {removedNotice && <p>{removedNotice}</p>}
          <Link to="/shop" className="ssz-btn">Continue shopping</Link>
        </div>
      </div>
    )
  }

  return (
      <div className="ssz-section"><div className="ssz-container">
      <h1 className="text-3xl font-medium mb-8">Your cart</h1>
      {removedNotice && (
        <div className="mb-6 flex items-start justify-between gap-3 bg-blush px-4 py-3 text-sm text-ink">
          <span>{removedNotice}</span>
          <button type="button" className="text-xs underline shrink-0" onClick={dismissRemovedNotice}>
            Dismiss
          </button>
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_380px] gap-10">
        <div className="space-y-6">
          {items.map((item) => (
            <div key={item.id} className="ssz-cart-line">
              <img src={item.image} alt="" className="ssz-cart-line__img" width="88" height="88" />
              <div className="ssz-cart-line__main">
                <div className="ssz-cart-line__top">
                  <Link to={`/products/${item.slug}`}>{item.name}</Link>
                  <p className="ssz-cart-line__total">{formatPKR(item.price * item.qty)}</p>
                </div>
                <p className="mt-1">{formatPKR(item.price)}</p>
                <div className="flex items-center gap-3 mt-3">
                  <div className="qty">
                    <button type="button" onClick={() => updateQty(item.id, item.qty - 1)}>
                      −
                    </button>
                    <input readOnly value={item.qty} />
                    <button type="button" onClick={() => updateQty(item.id, item.qty + 1)}>
                      +
                    </button>
                  </div>
                  <button type="button" className="text-sm underline" onClick={() => removeItem(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="text-sm underline" onClick={clearCart}>
            Clear cart
          </button>
        </div>

        {configured ? (
          <aside className="bg-meta p-6 h-fit">
            <h2 className="text-lg font-medium mb-4">Order summary</h2>
            <PromoField
              phone={form.phone}
              setPhone={(value) => setForm((current) => ({ ...current, phone: value }))}
              editingPhone={editingPhone || !form.phone}
              onEditPhone={() => setEditingPhone(true)}
              promoInput={promoInput}
              setPromoInput={setPromoInput}
              applyPromo={applyPromo}
              promo={promo}
              promoError={promoError}
              discount={discount}
              total={total}
              due={due}
            />
            <p className="text-xs text-ink-soft mb-4">Each mobile number can use an influencer code once.</p>
            <button type="button" className="ssz-btn" onClick={() => navigate('/checkout')}>
              Proceed to checkout
            </button>
            <a
              className="btn-outline block text-center mt-3"
              href={buildWhatsAppOrder(items, orderCustomer(content, {
                name: form.name,
                phone: form.phone,
                city: form.city,
                address: form.address,
                promoCode: promo?.couponCode,
                promoLabel: promo?.promotionName,
                discount,
                due,
              }))}
              onClick={rememberDetails}
              target="_blank"
              rel="noreferrer"
            >
              Order on WhatsApp
            </a>
          </aside>
        ) : (
          <aside className="bg-meta p-6 h-fit">
            <h2 className="text-lg font-medium mb-4">Checkout on WhatsApp</h2>
            <PromoField
              phone={form.phone}
              setPhone={(value) => setForm((current) => ({ ...current, phone: value }))}
              editingPhone={editingPhone || !form.phone}
              onEditPhone={() => setEditingPhone(true)}
              promoInput={promoInput}
              setPromoInput={setPromoInput}
              applyPromo={applyPromo}
              promo={promo}
              promoError={promoError}
              discount={discount}
              total={total}
              due={due}
            />
            <div className="space-y-3 mb-4">
              <input
                name="name"
                value={form.name}
                onChange={onChange}
                placeholder="Full name"
                className="w-full border border-line px-3 py-2.5 bg-white"
              />
              <input
                name="city"
                value={form.city}
                onChange={onChange}
                placeholder="City"
                className="w-full border border-line px-3 py-2.5 bg-white"
              />
              <textarea
                name="address"
                value={form.address}
                onChange={onChange}
                placeholder="Delivery address"
                rows={3}
                className="w-full border border-line px-3 py-2.5 bg-white"
              />
            </div>
            <a
              className="ssz-btn"
              href={buildWhatsAppOrder(items, orderCustomer(content, {
                ...form,
                promoCode: promo?.couponCode,
                promoLabel: promo?.promotionName,
                discount,
                due,
              }))}
              onClick={(event) => {
                rememberDetails()
                if (!promo?.couponCode) return
                const saved = recordInfluencerRedemption(promo.couponCode, form.phone)
                if (!saved.ok) {
                  event.preventDefault()
                  setPromo(null)
                  setPromoError(saved.reason)
                }
              }}
              target="_blank"
              rel="noreferrer"
            >
              Place order on WhatsApp
            </a>
            <p className="text-xs text-ink-soft mt-3">
              Each mobile number can use an influencer code once. We confirm stock and payment on WhatsApp.
            </p>
          </aside>
        )}
      </div>
      </div>
    </div>
  )
}

function PromoField({ phone, setPhone, editingPhone, onEditPhone, promoInput, setPromoInput, applyPromo, promo, promoError, discount, total, due }) {
  return (
    <div className="mb-4">
      {editingPhone ? (
        <>
          <label className="form-label" htmlFor="cart-phone">Mobile number</label>
          <input
            id="cart-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="03XXXXXXXXX"
            autoComplete="tel"
            className="w-full border border-line px-3 py-2.5 bg-white mb-3"
          />
        </>
      ) : (
        <p className="text-sm mb-3">Using {phone}. <button type="button" className="underline" onClick={onEditPhone}>Change</button></p>
      )}
      <label className="form-label" htmlFor="cart-promo">Influencer promo code</label>
      <div className="ssz-promo">
        <input
          id="cart-promo"
          value={promoInput}
          onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
          placeholder="CODE"
          className="flex-1 min-w-0 border border-line px-3 py-2.5 bg-white"
        />
        <button type="button" className="ssz-btn ssz-btn--outline" onClick={applyPromo}>
          Apply
        </button>
      </div>
      {promoError && <p className="form-error mt-2">{promoError}</p>}
      {promo?.eligible && (
        <p className="text-sm mt-2">{promo.promotionName}&rsquo;s code applied. {formatPKR(discount)} off.</p>
      )}
      <div className="flex justify-between mt-4">
        <span>Subtotal</span>
        <span className="font-medium">{formatPKR(total)}</span>
      </div>
      {discount > 0 && (
        <>
          <div className="flex justify-between mt-2 text-sm">
            <span>Discount</span>
            <span>−{formatPKR(discount)}</span>
          </div>
          <div className="flex justify-between mt-2 font-medium">
            <span>Due</span>
            <span>{formatPKR(due)}</span>
          </div>
        </>
      )}
    </div>
  )
}
