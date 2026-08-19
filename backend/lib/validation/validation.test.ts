import { describe, expect, it } from 'vitest'
import { ValidationError } from '../errors'
import {
  createOrderSchema,
  customerAddressSchema,
  pakistaniPhoneSchema,
  parseOrThrow,
  slugSchema,
} from './index'

describe('validation schemas', () => {
  it('accepts valid Pakistani phone numbers', () => {
    expect(pakistaniPhoneSchema.parse('03079594474')).toBe('03079594474')
    expect(pakistaniPhoneSchema.parse('+923079594474')).toBe('+923079594474')
  })

  it('rejects invalid phone numbers', () => {
    expect(() => pakistaniPhoneSchema.parse('12345')).toThrow()
  })

  it('accepts a valid slug and rejects an invalid one', () => {
    expect(slugSchema.parse('sadoer-collagen-mask')).toBe('sadoer-collagen-mask')
    expect(() => slugSchema.parse('Not A Slug!')).toThrow()
  })

  it('validates a customer address', () => {
    const address = customerAddressSchema.parse({
      recipientName: 'Ayesha Khan',
      phone: '03079594474',
      addressLine1: 'House 12, Street 4',
      city: 'Lahore',
    })
    expect(address.country).toBe('PK')
  })

  it('validates order creation input end to end via parseOrThrow', () => {
    const input = parseOrThrow(createOrderSchema, {
      email: 'test@example.com',
      items: [{ variantId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
    })
    expect(input.items).toHaveLength(1)
    expect(input.source).toBe('web')
  })

  it('throws ValidationError with field-level details on invalid input', () => {
    try {
      parseOrThrow(createOrderSchema, { items: [] })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const validationError = err as ValidationError
      expect(validationError.httpStatus).toBe(400)
      expect((validationError.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
    }
  })
})
