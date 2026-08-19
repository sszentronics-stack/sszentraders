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
  barcode: z.string().trim().max(80).optional(),
  title: z.string().trim().max(200).optional(),
  price: moneyMinorUnitsSchema,
  compareAtPrice: moneyMinorUnitsSchema.optional(),
  currency: currencySchema,
  weight: z.number().nonnegative().optional(),
  weightUnit: z.string().trim().max(10).optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
})
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>

/** Partial variant edit — every field optional except nothing is required, PATCH-style. */
export const updateVariantSchema = productVariantInputSchema.partial()
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>

/**
 * Free-form, admin-authored storefront content that doesn't warrant its own
 * column (see supabase/migrations/0016_catalog_content_attributes.sql).
 * Every field is optional so partial admin edits never fail validation for
 * content they haven't filled in yet.
 */
export const productAttributesSchema = z
  .object({
    shortName: z.string().trim().max(200).optional(),
    tagline: z.string().trim().max(200).optional(),
    subtitle: z.string().trim().max(200).optional(),
    badge: z.enum(['new', 'sale', 'bestseller']).optional(),
    highlights: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    benefits: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    howToUse: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    details: z.array(z.tuple([z.string().trim().min(1).max(80), z.string().trim().min(1).max(300)])).max(30).optional(),
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().nonnegative().optional(),
  })
  .partial()
  .default({})
export type ProductAttributesInput = z.infer<typeof productAttributesSchema>

export const createProductSchema = z.object({
  brandId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20000).optional(),
  ingredients: z.string().trim().max(20000).optional(),
  directions: z.string().trim().max(20000).optional(),
  productType: z.string().trim().max(120).optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(300).optional(),
  isFeatured: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  attributes: productAttributesSchema,
  variants: z.array(productVariantInputSchema).min(1, 'A product needs at least one variant/SKU.'),
  categoryIds: z.array(uuidSchema).default([]),
  collectionIds: z.array(uuidSchema).default([]),
})
export type CreateProductInput = z.infer<typeof createProductSchema>

/** PATCH-style product edit — everything optional except nothing is forced; variants/images are managed by their own endpoints. */
export const updateProductSchema = createProductSchema
  .omit({ variants: true })
  .partial()
export type UpdateProductInput = z.infer<typeof updateProductSchema>

export const contentStatusSchema = z.enum(['draft', 'published', 'archived'])
export const setStatusSchema = z.object({ status: contentStatusSchema })
export type SetStatusInput = z.infer<typeof setStatusSchema>

export const productImageInputSchema = z.object({
  variantId: uuidSchema.optional(),
  storagePath: z.string().trim().min(1).max(500),
  altText: z.string().trim().max(300).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  isPrimary: z.boolean().default(false),
})
export type ProductImageInput = z.infer<typeof productImageInputSchema>

export const reorderImagesSchema = z.object({
  order: z.array(z.object({ id: uuidSchema, sortOrder: z.number().int().nonnegative() })).min(1),
})
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>

export const imageUploadRequestSchema = z.object({
  variantId: uuidSchema.optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
})
export type ImageUploadRequestInput = z.infer<typeof imageUploadRequestSchema>

export const catalogEntityInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  status: contentStatusSchema.default('draft'),
  sortOrder: z.number().int().default(0),
})

export const brandInputSchema = catalogEntityInputSchema.extend({
  logoUrl: z.string().trim().url().optional(),
  websiteUrl: z.string().trim().url().optional(),
})
export type BrandInput = z.infer<typeof brandInputSchema>
export const updateBrandInputSchema = brandInputSchema.partial()

export const categoryInputSchema = catalogEntityInputSchema.extend({
  parentId: uuidSchema.optional(),
  imageUrl: z.string().trim().url().optional(),
})
export type CategoryInput = z.infer<typeof categoryInputSchema>
export const updateCategoryInputSchema = categoryInputSchema.partial()

export const collectionInputSchema = catalogEntityInputSchema
  .extend({
    imageUrl: z.string().trim().url().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt <= v.endsAt, {
    message: 'startsAt must be before or equal to endsAt',
    path: ['endsAt'],
  })
export type CollectionInput = z.infer<typeof collectionInputSchema>
export const updateCollectionInputSchema = catalogEntityInputSchema
  .extend({
    imageUrl: z.string().trim().url().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .partial()
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt <= v.endsAt, {
    message: 'startsAt must be before or equal to endsAt',
    path: ['endsAt'],
  })

export const idempotencyHeaderSchema = z.string().trim().min(8).max(200)

// ---------------------------------------------------------------------------
// Phase 2 — Customer Authentication & Profiles
// ---------------------------------------------------------------------------

/**
 * Supabase Auth itself enforces a configurable minimum (default 6); Aura
 * requires a stronger 8-char floor here so client-side validation matches
 * what a security-conscious storefront should ask for even before the
 * request reaches Supabase.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  phone: pakistaniPhoneSchema.optional(),
  marketingOptIn: z.boolean().default(false),
  redirectTo: z.string().trim().max(500).optional(),
})
export type RegisterInput = z.infer<typeof registerInputSchema>

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
  redirectTo: z.string().trim().max(500).optional(),
})
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>

export const passwordResetConfirmSchema = z.object({
  password: passwordSchema,
})
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  phone: pakistaniPhoneSchema.optional(),
  marketingOptIn: z.boolean().optional(),
})
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/** Partial address input for edits — create still uses the full customerAddressSchema. */
export const updateCustomerAddressSchema = customerAddressSchema.partial()
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>
export type CreateCustomerAddressInput = z.infer<typeof customerAddressSchema>

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
