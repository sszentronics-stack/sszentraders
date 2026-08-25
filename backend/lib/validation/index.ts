/**
 * Shared Zod validation schemas, used at every mutation boundary
 * (Edge Function request bodies) and reusable by frontend forms later.
 * Single authoritative source — do not re-derive these shapes elsewhere.
 *
 * Kept as a bare 'zod' specifier (not 'npm:zod@...') so this file type-checks
 * normally for the Vite/tsc frontend build and Vitest. Deno-side resolution
 * for Edge Function deploys comes from supabase/config.toml's per-function
 * import_map (supabase/functions/import_map.json), not from this import
 * itself — see that file for the npm: mapping.
 */
import { z } from 'zod'
import { ValidationError } from '../errors/index.ts'

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
 * column (see supabase/migrations/0023_catalog_content_attributes.sql).
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

// ---------------------------------------------------------------------------
// Phase 5 — Persistent Cart, Wishlist & Shopping State
// ---------------------------------------------------------------------------

export const cartItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().positive().max(999),
})
export type CartItemInput = z.infer<typeof cartItemInputSchema>

export const updateCartItemQuantitySchema = z.object({
  quantity: z.number().int().positive().max(999),
})
export type UpdateCartItemQuantityInput = z.infer<typeof updateCartItemQuantitySchema>

/** Body of POST /cart/merge, sent once right after a guest signs in/registers — see backend/services/cart/cart.service.ts. */
export const mergeCartItemsSchema = z.object({
  items: z.array(cartItemInputSchema).max(200),
})
export type MergeCartItemsInput = z.infer<typeof mergeCartItemsSchema>

export const wishlistItemInputSchema = z.object({
  productId: uuidSchema,
})
export type WishlistItemInput = z.infer<typeof wishlistItemInputSchema>

export const recentlyViewedInputSchema = z.object({
  productId: uuidSchema,
})
export type RecentlyViewedInput = z.infer<typeof recentlyViewedInputSchema>

// ---------------------------------------------------------------------------
// Phase 6 — Checkout & Order Management
// ---------------------------------------------------------------------------

/**
 * Shipping address as captured at checkout. Deliberately a separate, leaner
 * shape from customerAddressSchema (no isDefaultShipping/isDefaultBilling —
 * meaningless for a one-off order snapshot; no landmark — orders has no
 * such column, see 0018_order_address_snapshot.sql) rather than reusing
 * that schema — this is what actually gets snapshotted onto `orders`.
 */
export const checkoutShippingAddressSchema = z.object({
  recipientName: z.string().trim().min(1).max(200),
  phone: pakistaniPhoneSchema,
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1).max(120),
  province: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).default('PK'),
  /** Which saved customer_addresses row this came from, if any — stored on the order as a convenience back-reference only (the fields above remain the source of truth). */
  savedAddressId: uuidSchema.optional(),
})
export type CheckoutShippingAddressInput = z.infer<typeof checkoutShippingAddressSchema>

/**
 * The checkout request body. Deliberately carries NO line items — unlike
 * Phase 1's placeholder createOrderSchema (which accepted a client-supplied
 * items array), order creation always derives its line items from the
 * caller's own server-side cart (backend/services/cart/cart.service.ts),
 * never from anything the client asserts here. See
 * backend/services/orders/orders.service.ts for why.
 */
export const checkoutSchema = z
  .object({
    email: emailSchema.optional(),
    phone: pakistaniPhoneSchema.optional(),
    shippingAddress: checkoutShippingAddressSchema,
    deliveryMethod: z.enum(['standard', 'express']).default('standard'),
    paymentMethod: z.enum(['cod', 'easypaisa']).default('cod'),
    customerNotes: z.string().trim().max(2000).optional(),
    source: z.enum(['web', 'whatsapp', 'mobile', 'admin']).default('web'),
    /** Phase 13: optional coupon code applied at checkout — validated and priced server-side only, see backend/services/promotions/promotions.service.ts. */
    couponCode: z.string().trim().min(1).max(60).optional(),
    /** Phase 13: optional loyalty points to redeem toward this order — server re-checks balance/eligibility, never trusts a client-computed discount value. */
    redeemPoints: z.number().int().positive().optional(),
  })
  .refine((v) => Boolean(v.email || v.phone), { message: 'Provide at least an email or phone number.', path: ['email'] })
export type CheckoutInput = z.infer<typeof checkoutSchema>

/** Order-number + email match — the guest order lookup path (no sequential/guessable id exposure; see orders.service.ts). */
export const guestOrderLookupSchema = z.object({
  orderNumber: z.string().trim().min(5).max(40),
  email: emailSchema,
})
export type GuestOrderLookupInput = z.infer<typeof guestOrderLookupSchema>

export const cancelOrderRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})
export type CancelOrderRequestInput = z.infer<typeof cancelOrderRequestSchema>

// ---------------------------------------------------------------------------
// Phase 9 — ERP-Controlled Inventory & Availability Synchronization
// ---------------------------------------------------------------------------

export const inventoryMappingInputSchema = z.object({
  variantId: uuidSchema,
  ledgixItemId: z.string().trim().min(1).max(200),
})
export type InventoryMappingInput = z.infer<typeof inventoryMappingInputSchema>

/** Phase 10 — start/retry an Easypaisa payment attempt against an order the caller owns. */
export const easypaisaInitiateSchema = z.object({
  orderId: uuidSchema,
  returnUrl: z.string().trim().url().optional(),
})
export type EasypaisaInitiateInput = z.infer<typeof easypaisaInitiateSchema>

/** Phase 10 — admin-initiated refund against an already-paid Easypaisa payment. */
export const easypaisaRefundSchema = z.object({
  paymentId: uuidSchema,
  amount: moneyMinorUnitsSchema,
  reason: z.string().trim().max(500).optional(),
})
export type EasypaisaRefundInput = z.infer<typeof easypaisaRefundSchema>

// ---------------------------------------------------------------------------
// Phase 14 — Reviews, Returns & Customer Service
// ---------------------------------------------------------------------------

export const createReviewSchema = z.object({
  orderItemId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional(),
  body: z.string().trim().max(4000).optional(),
})
export type CreateReviewInput = z.infer<typeof createReviewSchema>

export const moderateReviewSchema = z.object({
  status: z.enum(['published', 'rejected']),
  moderationNote: z.string().trim().max(1000).optional(),
})
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>

export const reviewImageUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
})
export type ReviewImageUploadRequestInput = z.infer<typeof reviewImageUploadRequestSchema>

export const attachReviewImageSchema = z.object({
  storagePath: z.string().trim().min(1).max(500),
})
export type AttachReviewImageInput = z.infer<typeof attachReviewImageSchema>

const returnReasonCodeSchema = z.enum([
  'damaged_in_transit',
  'wrong_item_received',
  'not_as_described',
  'defective_quality',
  'changed_mind',
  'size_fit_issue',
  'other',
])

/** A signed upload URL request for return evidence, keyed by the order item being returned — see backend/lib/media's buildReturnEvidenceStoragePath doc for why (no return_item_id exists yet at upload time). */
export const returnEvidenceUploadRequestSchema = z.object({
  orderItemId: uuidSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
})
export type ReturnEvidenceUploadRequestInput = z.infer<typeof returnEvidenceUploadRequestSchema>

export const returnRequestLineSchema = z.object({
  orderItemId: uuidSchema,
  quantity: z.number().int().positive().max(999),
  reasonCode: returnReasonCodeSchema,
  notes: z.string().trim().max(1000).optional(),
  /** storagePath values already uploaded via POST /returns/evidence/upload-url. */
  evidenceStoragePaths: z.array(z.string().trim().min(1).max(500)).max(6).default([]),
})
export type ReturnRequestLineInput = z.infer<typeof returnRequestLineSchema>

export const createReturnRequestSchema = z.object({
  orderId: uuidSchema,
  customerNotes: z.string().trim().max(2000).optional(),
  items: z.array(returnRequestLineSchema).min(1),
})
export type CreateReturnRequestInput = z.infer<typeof createReturnRequestSchema>

/** Admin approve/reject of a `requested`/`under_review` return. */
export const returnDecisionSchema = z.object({
  note: z.string().trim().max(1000).optional(),
})
export type ReturnDecisionInput = z.infer<typeof returnDecisionSchema>

/** Admin move a return into review (from `requested`). */
export const returnReviewSchema = z.object({
  note: z.string().trim().max(1000).optional(),
})
export type ReturnReviewInput = z.infer<typeof returnReviewSchema>

/** Admin records what happened once the returned item was physically received/inspected. */
export const recordInspectionOutcomeSchema = z
  .object({
    resolution: z.enum(['refund', 'replacement']),
    inspectionNotes: z.string().trim().max(2000).optional(),
    /** Required when resolution is "refund" — the server never guesses an amount; this is the admin's inspected decision, still capped server-side against the order's paid amount. */
    refundAmount: moneyMinorUnitsSchema.optional(),
  })
  .refine((v) => v.resolution !== 'refund' || typeof v.refundAmount === 'number', {
    message: 'refundAmount is required when resolution is "refund".',
    path: ['refundAmount'],
  })
export type RecordInspectionOutcomeInput = z.infer<typeof recordInspectionOutcomeSchema>

// ---------------------------------------------------------------------------
// Phase 13 — Promotions, Loyalty & Customer Intelligence
// ---------------------------------------------------------------------------

/** Cart/checkout-time discount preview request — server recomputes everything against the caller's own live cart, this only carries the optional coupon code being tried. */
export const discountPreviewSchema = z.object({
  couponCode: z.string().trim().min(1).max(60).optional(),
})
export type DiscountPreviewInput = z.infer<typeof discountPreviewSchema>

const promotionStatusEnum = z.enum(['draft', 'active', 'paused', 'expired', 'archived'])

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
  status: promotionStatusEnum.optional(),
  startsAt: z.string().trim().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().trim().datetime({ offset: true }).nullable().optional(),
})
export type CampaignInput = z.infer<typeof campaignInputSchema>

export const updateCampaignSchema = campaignInputSchema.partial().omit({ slug: true })
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>

export const promotionInputSchema = z.object({
  campaignId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'free_shipping']),
  discountValue: z.number().int().nonnegative(),
  status: promotionStatusEnum.optional(),
  startsAt: z.string().trim().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().trim().datetime({ offset: true }).nullable().optional(),
  minSpend: moneyMinorUnitsSchema.nullable().optional(),
  firstOrderOnly: z.boolean().optional(),
  appliesTo: z.enum(['all', 'category', 'collection', 'product']).optional(),
  scopeId: uuidSchema.nullable().optional(),
})
export type PromotionInput = z.infer<typeof promotionInputSchema>

export const updatePromotionSchema = promotionInputSchema.partial()
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>

export const couponInputSchema = z.object({
  promotionId: uuidSchema,
  code: z.string().trim().min(3).max(60),
  usageLimit: z.number().int().positive().nullable().optional(),
  usageLimitPerCustomer: z.number().int().positive().nullable().optional(),
  status: promotionStatusEnum.optional(),
})
export type CouponInput = z.infer<typeof couponInputSchema>

export const updateCouponSchema = couponInputSchema.partial().omit({ promotionId: true, code: true })
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>

/** Checkout-time reorder request — no body needed beyond the order id in the route. */
export const reorderRequestSchema = z.object({}).optional()
export type ReorderRequestInput = z.infer<typeof reorderRequestSchema>

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
