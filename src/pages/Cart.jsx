import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { buildWhatsAppOrder, formatPKR } from '../data/products'

export default function Cart() {
  const { items, total, updateQty, removeItem, clearCart } = useCart()
  const [form, setForm] = useState({ name: '', phone: '', city: '', address: '' })

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
    <div className="container-aura py-10 md:py-14">
      <h1 className="text-3xl font-medium mb-8">Your cart</h1>
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

        <aside className="bg-meta p-6 h-fit">
          <h2 className="text-lg font-medium mb-4">Checkout on WhatsApp</h2>
          <div className="flex justify-between mb-4">
            <span>Subtotal</span>
            <span className="font-medium">{formatPKR(total)}</span>
          </div>
          <div className="space-y-3 mb-4">
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder="Full name"
              className="w-full border border-line px-3 py-2.5 bg-white"
            />
            <input
              name="phone"
              value={form.phone}
              onChange={onChange}
              placeholder="Phone number"
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
            className="btn-lavender block text-center"
            href={buildWhatsAppOrder(items, form)}
            target="_blank"
            rel="noreferrer"
          >
            Place order on WhatsApp
          </a>
          <p className="text-xs text-ink-soft mt-3">
            We will confirm stock, shipping, and payment (COD, JazzCash, EasyPaisa, or bank transfer)
            on WhatsApp.
          </p>
        </aside>
      </div>
    </div>
  )
}
