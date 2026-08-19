import { describe, expect, it } from 'vitest'
import { ValidationError } from '../errors/index.ts'
import {
  MAX_IMAGE_BYTES,
  buildBrandAssetStoragePath,
  buildProductImageStoragePath,
  buildReturnEvidenceStoragePath,
  buildReviewImageStoragePath,
  sanitizeFileName,
  validateImageUpload,
} from './index.ts'

describe('validateImageUpload', () => {
  it('accepts a valid jpeg under the size limit', () => {
    expect(
      validateImageUpload({ fileName: 'mask.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
    ).toBe('image/jpeg')
  })

  it('rejects an unsupported mime type', () => {
    expect(() => validateImageUpload({ fileName: 'x.gif', mimeType: 'image/gif', sizeBytes: 1024 })).toThrow(
      ValidationError,
    )
  })

  it('rejects a file over the size limit', () => {
    expect(() =>
      validateImageUpload({ fileName: 'huge.png', mimeType: 'image/png', sizeBytes: MAX_IMAGE_BYTES + 1 }),
    ).toThrow(ValidationError)
  })

  it('rejects a non-positive size', () => {
    expect(() => validateImageUpload({ fileName: 'x.png', mimeType: 'image/png', sizeBytes: 0 })).toThrow(
      ValidationError,
    )
  })
})

describe('sanitizeFileName', () => {
  it('strips path separators', () => {
    expect(sanitizeFileName('../../etc/passwd.png')).not.toMatch(/[\\/]/)
  })
})

describe('storage path builders', () => {
  it('builds a product image path from stable IDs only, never the file name', () => {
    const path = buildProductImageStoragePath({
      productId: 'prod-1',
      variantId: 'var-1',
      imageId: 'img-1',
      mimeType: 'image/webp',
    })
    expect(path).toBe('prod-1/var-1/img-1.webp')
  })

  it('falls back to "default" when there is no variant', () => {
    const path = buildProductImageStoragePath({
      productId: 'prod-1',
      variantId: null,
      imageId: 'img-1',
      mimeType: 'image/png',
    })
    expect(path).toBe('prod-1/default/img-1.png')
  })

  it('builds a brand asset path', () => {
    expect(buildBrandAssetStoragePath({ brandId: 'brand-1', assetId: 'asset-1', mimeType: 'image/jpeg' })).toBe(
      'brand-1/asset-1.jpg',
    )
  })

  it('builds a review image path', () => {
    expect(buildReviewImageStoragePath({ reviewId: 'rev-1', imageId: 'img-1', mimeType: 'image/webp' })).toBe(
      'rev-1/img-1.webp',
    )
  })

  it('builds a return evidence path', () => {
    expect(buildReturnEvidenceStoragePath({ orderItemId: 'oi-1', evidenceId: 'ev-1', mimeType: 'image/jpeg' })).toBe(
      'oi-1/ev-1.jpg',
    )
  })
})
