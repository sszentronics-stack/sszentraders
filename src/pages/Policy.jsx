import { Navigate, useLocation } from 'react-router-dom'

const PAGES = {
  privacy: {
    title: 'Privacy policy',
    body: `SS Zen Traders collects only the information you share when you place an order — typically your name, WhatsApp number, city, and delivery address. We use this information to confirm and fulfill orders. We do not sell your personal information. Messages sent through WhatsApp are subject to WhatsApp’s own privacy terms. For questions, contact us on WhatsApp at +92 307 9594474.`,
  },
  shipping: {
    title: 'Shipping policy',
    body: `We deliver across Islamabad and Rawalpindi. Estimated delivery is 3–5 working days after order confirmation on WhatsApp. Shipping charges, if any, are confirmed before you pay. Please provide a complete address and an active phone number so the courier can reach you.`,
  },
  refund: {
    title: 'Refund policy',
    body: `We offer a 7-day easy return and exchange on unopened products in original packaging. Opened skincare cannot be returned for hygiene reasons unless the item is damaged or incorrect. If you receive a damaged or wrong product, send photos on WhatsApp within 48 hours of delivery. Approved refunds are processed via the original payment method or JazzCash / EasyPaisa / bank transfer.`,
  },
  terms: {
    title: 'Terms of service',
    body: `By shopping at SS Zen Traders you agree that product listings are for reference, prices may change without notice until an order is confirmed, and we may refuse or cancel orders in case of pricing errors, stock issues, or suspected fraud. Skincare results vary. You are responsible for reading labels and following directions. These terms are governed by the laws of Pakistan.`,
  },
}

export default function Policy() {
  const key = useLocation().pathname.replace(/^\//, '')
  const page = PAGES[key]
  if (!page) return <Navigate to="/" replace />

  return (
    <div className="container-aura py-12 md:py-16 max-w-3xl">
      <h1 className="text-4xl font-medium mb-6">{page.title}</h1>
      <p className="leading-relaxed text-ink-soft whitespace-pre-line">{page.body}</p>
    </div>
  )
}
