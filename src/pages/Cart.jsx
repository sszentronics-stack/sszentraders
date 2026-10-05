import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { buildWhatsAppOrder, formatPKR } from '../data/products'
import { orderCustomer, useSiteContent, whatsAppHref } from '../lib/siteContent'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { getAppliedInfluencerPromo, normalizePhone, quoteInfluencerCode, recordInfluencerRedemption, setAppliedInfluencerPromo } from '../lib/influencerCodes'
import { useSeo } from '../hooks/useSeo'

export default function Cart() {
  useSeo({ title: 'Your cart | SS Zen Traders', noindex: true })
  const content = useSiteContent()
  const configured = isSupabaseConfigured()
  const navigate = useNavigate()
  const { items, total, updateQty, removeItem, clearCart, removedNotice, dismissRemovedNotice } = useCart()
  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '' })
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

  useEffect(() => {
    const applied = getAppliedInfluencerPromo()
    if (!applied?.code) return
    setPromoInput(applied.code)
    setForm((current) => (current.phone ? current : { ...current, phone: applied.phone || '' }))
  }, [])

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

  if (items.length === 0) {
    return (
      <div className="container-aura py-20 text-center">
        <h1 className="text-3xl font-medium mb-3">Your cart is empty</h1>
        <Link to="/shop" className="btn-lavender inline-block w-auto px-8">
          Continue shopping
        </Link>
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
            <div key={item.id} className="flex gap-4 border-b border-[#eee] pb-6">
              <img src={item.image} alt="" className="w-24 h-24 object-contain bg-meta" />
              <div className="flex-1">
                <Link to={`/products/${item.slug}`} className="font-medium">
                  {item.name}
                </Link>
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
              <p className="font-medium">{formatPKR(item.price * item.qty)}</p>
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
              href={whatsAppHref(content, 'Hi! I have a question before placing my order.')}
              target="_blank"
              rel="noreferrer"
            >
              Ask a question on WhatsApp
            </a>
          </aside>
        ) : (
          <aside className="bg-meta p-6 h-fit">
            <h2 className="text-lg font-medium mb-4">Checkout on WhatsApp</h2>
            <PromoField
              phone={form.phone}
              setPhone={(value) => setForm((current) => ({ ...current, phone: value }))}
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

function PromoField({ phone, setPhone, promoInput, setPromoInput, applyPromo, promo, promoError, discount, total, due }) {
  return (
    <div className="mb-4">
      <label className="form-label" htmlFor="cart-phone">Mobile number</label>
      <input
        id="cart-phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="03XXXXXXXXX"
        className="w-full border border-line px-3 py-2.5 bg-white mb-3"
      />
      <label className="form-label" htmlFor="cart-promo">Influencer promo code</label>
      <div className="flex gap-2">
        <input
          id="cart-promo"
          value={promoInput}
          onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
          placeholder="CODE"
          className="flex-1 border border-line px-3 py-2.5 bg-white"
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
