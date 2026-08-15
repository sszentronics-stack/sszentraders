import { WHATSAPP_DISPLAY, WHATSAPP_LINK } from '../data/products'

export default function Contact() {
  return (
    <div className="container-aura py-12 md:py-16 grid md:grid-cols-2 gap-12">
      <div>
        <h1 className="text-4xl font-medium mb-4">Contact</h1>
        <p className="text-ink-soft mb-6">
          Questions about Mighty Patch, SOME BY MI, shipping, or an existing order? Message us on
          WhatsApp — that is the fastest way to reach Aura Beauty Care.
        </p>
        <p className="mb-2">
          <strong>WhatsApp:</strong>{' '}
          <a className="underline" href={WHATSAPP_LINK} target="_blank" rel="noreferrer">
            {WHATSAPP_DISPLAY}
          </a>
        </p>
        <p className="mb-2">
          <strong>Hours:</strong> 11:00 AM – 9:00 PM (Pakistan time)
        </p>
        <p>
          <strong>Shipping:</strong> Delivery across Islamabad and Rawalpindi
        </p>
      </div>
      <div className="bg-meta p-8">
        <h2 className="text-xl font-medium mb-3">Start a chat</h2>
        <p className="text-sm text-ink-soft mb-5">
          Tell us which product you want and your city. We will confirm price, stock, and delivery.
        </p>
        <a
          className="btn-lavender inline-block w-auto px-8"
          href={`${WHATSAPP_LINK}?text=${encodeURIComponent('Hi Aura Beauty Care! I would like help with an order.')}`}
          target="_blank"
          rel="noreferrer"
        >
          Chat on WhatsApp
        </a>
      </div>
    </div>
  )
}
