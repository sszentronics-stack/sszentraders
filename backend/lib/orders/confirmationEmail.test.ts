import { describe, expect, it } from 'vitest'
import { buildOrderConfirmationMessage, sendOrderConfirmationEmail } from './confirmationEmail.ts'

const order = {
  orderNumber: 'SSZ-1001',
  email: 'customer@example.com',
  currency: 'PKR',
  subtotal: 440000,
  shippingTotal: 20000,
  grandTotal: 460000,
  orderStatus: 'pending',
  paymentStatus: 'pending',
  paymentMethod: 'cod',
  deliveryMethod: 'standard',
  shippingAddress: {
    recipientName: 'Ayesha Khan',
    addressLine1: 'House 12, Street 4',
    addressLine2: 'G-13/3',
    city: 'Islamabad',
    province: 'Islamabad',
  },
  items: [{ productName: 'Hero Mighty Patch Invisible+', variantName: null, quantity: 1, lineTotal: 440000 }],
}

describe('order confirmation email', () => {
  it('includes the same order content shown on the confirmation page', () => {
    const message = buildOrderConfirmationMessage(order)
    expect(message.subject).toBe('Your SS Zen Traders order SSZ-1001')
    expect(message.text).toContain('Order SSZ-1001 — Pending confirmation')
    expect(message.text).toContain('Hero Mighty Patch Invisible+ × 1 — Rs.4,400')
    expect(message.text).toContain('Total: Rs.4,600')
    expect(message.text).toContain('Ayesha Khan, House 12, Street 4, G-13/3, Islamabad, Islamabad')
    expect(message.text).toContain('Cash on Delivery')
  })

  it('does not send when no mail key is configured', async () => {
    const result = await sendOrderConfirmationEmail(order, {})
    expect(result).toEqual({ sent: false, reason: 'not-configured' })
  })

  it('posts the confirmation to the mail provider', async () => {
    let body = ''
    const result = await sendOrderConfirmationEmail(order, { apiKey: 'test-key', from: 'Shop <info@sszentraders.com>' }, async (_url, init) => {
      body = String(init?.body || '')
      return new Response('{}', { status: 200 })
    })
    expect(result.sent).toBe(true)
    expect(body).toContain('customer@example.com')
    expect(body).toContain('Hero Mighty Patch Invisible+')
  })
})
