/**
 * Shared Zod validation schemas, used at every mutation boundary
 * (Edge Function request bodies) and reusable by frontend forms later.
 * Single authoritative source — do not re-derive these shapes elsewhere.
 */
import { z } from 'zod'
import { ValidationError } from '../errors'

export const uuidSchema = z.string().uuid()

export const moneyMinorUnitsSchema = z.number().int().nonnegative()

export const currencySchema = z.string().length(3).default('PKR')

export const pakistaniPhoneSchema = z
  .string()
  .trim()
  .regex(/^(\+92|0)?3\d{9}$/, 'Must be a valid Pakistani mobile number, e.g. 03079594474 or +923079594474')

export const emailSchema = z.string().trim().toLowerCase().email()

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a URL-safe slug (lowercase letters, numbers, hyphens)')

export const customerAddressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  recipientName: z.string().trim().min(1).max(200),
  phone: pakistaniPhoneSchema,
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).default('PK'),
  landmark: z.string().trim().max(300).optional(),
  isDefaultShipping: z.boolean().optional(),
  isDefaultBilling: z.boolean().optional(),
})

export const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  email: emailSchema.optional(),
  phone: pakistaniPhoneSchema.optional(),
  marketingOptIn: z.boolean().default(false),
})

export const orderLineItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().positive().max(999),
})

export const createOrderSchema = z.object({
  customerId: uuidSchema.optional(),
  email: emailSchema.optional(),
  phone: pakistaniPhoneSchema.optional(),
  items: z.array(orderLineItemInputSchema).min(1),
  shippingAddress: customerAddressSchema.optional(),
  customerNotes: z.string().trim().max(2000).optional(),
  source: z.enum(['web', 'whatsapp', 'mobile', 'admin']).default('web'),
})
export type CreateOrderInput = z.infer<typeof createOrderSchema>

export const productVariantInputSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  title: z.string().trim().max(200).optional(),
  price: moneyMinorUnitsSchema,
  compareAtPrice: moneyMinorUnitsSchema.optional(),
  currency: currencySchema,
  attributes: z.record(z.string(), z.unknown()).default({}),
})

export const createProductSchema = z.object({
  brandId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20000).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  variants: z.array(productVariantInputSchema).min(1),
  categoryIds: z.array(uuidSchema).default([]),
})
export type CreateProductInput = z.infer<typeof createProductSchema>

export const idempotencyHeaderSchema = z.string().trim().min(8).max(200)

/** Validate `input` against `schema`, throwing a ValidationError (see ../errors) with field-level detail on failure. */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ValidationError(
      'Request failed validation',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }
  return result.data
}
