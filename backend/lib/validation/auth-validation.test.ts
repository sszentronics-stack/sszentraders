import { describe, expect, it } from 'vitest'
import { ValidationError } from '../errors/index.ts'
import {
  loginInputSchema,
  parseOrThrow,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerInputSchema,
  updateCustomerAddressSchema,
  updateProfileSchema,
} from './index.ts'

describe('Phase 2 auth validation schemas', () => {
  it('accepts a valid registration payload and defaults marketingOptIn to false', () => {
    const input = parseOrThrow(registerInputSchema, {
      email: 'Ayesha@Example.com',
      password: 'supersecret1',
    })
    expect(input.email).toBe('ayesha@example.com')
    expect(input.marketingOptIn).toBe(false)
  })

  it('rejects a short password', () => {
    expect(() => parseOrThrow(registerInputSchema, { email: 'a@b.com', password: 'short' })).toThrow(
      ValidationError,
    )
  })

  it('validates login input requires a non-empty password', () => {
    expect(() => loginInputSchema.parse({ email: 'a@b.com', password: '' })).toThrow()
    expect(loginInputSchema.parse({ email: 'a@b.com', password: 'x' }).email).toBe('a@b.com')
  })

  it('validates password reset request needs only an email', () => {
    expect(passwordResetRequestSchema.parse({ email: 'a@b.com' }).email).toBe('a@b.com')
  })

  it('validates password reset confirm enforces the password policy', () => {
    expect(() => passwordResetConfirmSchema.parse({ password: 'short' })).toThrow()
    expect(passwordResetConfirmSchema.parse({ password: 'longenough1' }).password).toBe('longenough1')
  })

  it('allows a partial profile update', () => {
    const input = updateProfileSchema.parse({ phone: '03079594474' })
    expect(input.phone).toBe('03079594474')
    expect(input.firstName).toBeUndefined()
  })

  it('rejects an invalid phone on profile update', () => {
    expect(() => updateProfileSchema.parse({ phone: '12345' })).toThrow()
  })

  it('allows a partial address update with no required fields', () => {
    const input = updateCustomerAddressSchema.parse({ city: 'Karachi' })
    expect(input.city).toBe('Karachi')
    expect(input.recipientName).toBeUndefined()
    expect(input.addressLine1).toBeUndefined()
  })
})
