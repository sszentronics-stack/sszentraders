import { formatMoney } from '../money/index.ts'

export interface ConfirmationLine {
  productName: string
  variantName?: string | null
  quantity: number
  lineTotal: number
}

export interface ConfirmationOrder {
  orderNumber: string
  email?: string | null
  currency?: string | null
  subtotal: number
  shippingTotal: number
  grandTotal: number
  orderStatus?: string | null
  paymentStatus?: string | null
  paymentMethod?: string | null
  deliveryMethod?: string | null
  shippingAddress?: {
    recipientName?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    province?: string | null
  } | null
  items: ConfirmationLine[]
}

const PAYMENT_LABEL: Record<string, string> = { cod: 'Cash on Delivery', easypaisa: 'Easypaisa' }
const STATUS_LABEL: Record<string, string> = { pending: 'Pending confirmation', confirmed: 'Confirmed' }

function money(amount: number, currency?: string | null) {
  return formatMoney(amount, { currency: currency || 'PKR' })
}

/** Plain-text body that matches the order confirmation page. */
export function buildOrderConfirmationMessage(order: ConfirmationOrder) {
  const currency = order.currency || 'PKR'
  const status = STATUS_LABEL[order.orderStatus || ''] || order.orderStatus || 'Pending confirmation'
  const payment = PAYMENT_LABEL[order.paymentMethod || ''] || order.paymentMethod || 'Cash on Delivery'
  const delivery = `${order.deliveryMethod || 'standard'} delivery`
  const address = order.shippingAddress
  const shipTo = [
    address?.recipientName,
    address?.addressLine1,
    address?.addressLine2,
    address?.city,
    address?.province,
  ].filter(Boolean).join(', ')

  const lines = [
    'Thank you for your order',
    '',
    `Order ${order.orderNumber} — ${status}`,
    '',
    `Payment method: ${payment}`,
    `Payment status: ${order.paymentStatus || 'pending'}`,
    `Delivery: ${delivery}`,
    '',
    'Items',
    ...order.items.map((item) => {
      const name = `${item.productName}${item.variantName ? ` — ${item.variantName}` : ''}`
      return `${name} × ${item.quantity} — ${money(item.lineTotal, currency)}`
    }),
    '',
    `Subtotal: ${money(order.subtotal, currency)}`,
    `Delivery: ${money(order.shippingTotal, currency)}`,
    `Total: ${money(order.grandTotal, currency)}`,
    '',
    'Shipping to',
    shipTo || 'Address confirmed at checkout',
    '',
    'SS Zen Traders',
    'Office#14, First Floor, Farooq 2D Plaza, G-13/3, Islamabad',
    '03079594474',
    'info@sszentraders.com',
  ]

  return {
    subject: `Your SS Zen Traders order ${order.orderNumber}`,
    text: lines.join('\n'),
  }
}

export interface MailEnv {
  apiKey?: string | null
  from?: string | null
}

/** Sends the confirmation when a mail key is configured. A missing key does not fail the order. */
export async function sendOrderConfirmationEmail(
  order: ConfirmationOrder,
  env: MailEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: boolean; reason?: string }> {
  const to = String(order.email || '').trim()
  if (!to) return { sent: false, reason: 'no-email' }
  if (!env.apiKey) return { sent: false, reason: 'not-configured' }

  const message = buildOrderConfirmationMessage(order)
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.from || 'SS Zen Traders <info@sszentraders.com>',
      to: [to],
      subject: message.subject,
      text: message.text,
    }),
  })
  if (!response.ok) return { sent: false, reason: `mail-${response.status}` }
  return { sent: true }
}
