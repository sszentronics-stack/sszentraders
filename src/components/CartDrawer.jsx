import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { buildWhatsAppOrder, formatPKR } from '../data/products'
import { orderCustomer, useSiteContent } from '../lib/siteContent'
import { isSupabaseConfigured } from '../lib/supabase/client'

export default function CartDrawer() {
  const content = useSiteContent()
  const configured = isSupabaseConfigured()
  const { items, total, isOpen, setIsOpen, updateQty, removeItem, removedNotice, dismissRemovedNotice } = useCart()

  if (!isOpen) return null

  return (
    <div className="drawer-overlay" onClick={() => setIsOpen(false)}>
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e8e8]">
          <h2 className="text-lg font-medium">Your cart</h2>
          <button type="button" aria-label="Close cart" onClick={() => setIsOpen(false)}>
            <X />
          </button>
        </div>

        {removedNotice && (
          <div className="mx-5 mt-4 flex items-start justify-between gap-3 bg-blush px-3 py-2.5 text-xs text-ink">
            <span>{removedNotice}</span>
            <button type="button" aria-label="Dismiss" onClick={dismissRemovedNotice} className="shrink-0">
              <X size={14} />
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex-1 grid place-items-center p-8 text-center text-ink-soft">
            <div>
              <p className="mb-4">Your cart is empty</p>
              <Link to="/shop" className="btn-lavender inline-block w-auto px-6" onClick={() => setIsOpen(false)}>
                Continue shopping
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto p-5 space-y-5">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <Link to={`/products/${item.slug}`} onClick={() => setIsOpen(false)}>
                    <img src={item.image} alt="" className="w-20 h-20 object-contain bg-meta" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/products/${item.slug}`} onClick={() => setIsOpen(false)} className="text-sm font-medium">
                      {item.name}
                    </Link>
                    <p className="text-sm mt-1">{formatPKR(item.price)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="qty">
                        <button type="button" onClick={() => updateQty(item.id, item.qty - 1)}>
                          −
                        </button>
                        <input readOnly value={item.qty} />
                        <button type="button" onClick={() => updateQty(item.id, item.qty + 1)}>
                          +
                        </button>
                      </div>
                      <button type="button" className="text-xs underline" onClick={() => removeItem(item.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-[#e8e8e8] space-y-3">
              <div className="flex justify-between font-medium">
                <span>Subtotal</span>
                <span>{formatPKR(total)}</span>
              </div>
              {configured ? (
                <>
                  <Link to="/checkout" className="btn-lavender block text-center" onClick={() => setIsOpen(false)}>
                    Proceed to checkout
                  </Link>
                  <Link to="/cart" className="btn-outline block text-center" onClick={() => setIsOpen(false)}>
                    View cart &amp; details
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-xs text-ink-soft">Checkout continues on WhatsApp. Cash on delivery available.</p>
                  <a
                    className="btn-lavender block text-center"
                    href={buildWhatsAppOrder(items, orderCustomer(content))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Order on WhatsApp
                  </a>
                  <Link to="/cart" className="btn-outline block text-center" onClick={() => setIsOpen(false)}>
                    View cart &amp; details
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
