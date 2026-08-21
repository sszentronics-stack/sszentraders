import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus, Star, X } from 'lucide-react'
import { AdminBreadcrumb, AdminCard } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { isSupabaseConfigured } from '../../../lib/supabase/client'
import {
  createProduct,
  requestImageUploadUrl,
  uploadProductImageFile,
  recordProductImage,
} from '../../../repositories/admin/products.admin.repository'
import { listAllBrands } from '../../../repositories/admin/catalog.admin.repository'
import { toMinorUnits } from '../../../../backend/lib/money/index'

/**
 * Product creation form with starter variant + optional product pictures.
 * Images are staged locally (with previews), then uploaded after the product
 * row exists so we have a productId for the signed upload URL flow.
 */
export default function ProductForm() {
  const navigate = useNavigate()
  const toast = useAdminToast()
  const configured = isSupabaseConfigured()
  const [brands, setBrands] = useState([])
  const [saving, setSaving] = useState(false)
  const [images, setImages] = useState([]) // { id, file, previewUrl, isPrimary }
  const [form, setForm] = useState({
    name: '',
    brandId: '',
    shortDescription: '',
    description: '',
    sku: '',
    price: '',
    compareAtPrice: '',
    currency: 'PKR',
  })

  useEffect(() => {
    if (!configured) return
    listAllBrands().then(setBrands).catch(() => setBrands([]))
  }, [configured])

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function addImages(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return

    setImages((prev) => {
      const next = [...prev]
      files.forEach((file) => {
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          isPrimary: next.length === 0,
        })
      })
      if (!next.some((img) => img.isPrimary) && next.length) {
        next[0] = { ...next[0], isPrimary: true }
      }
      return next
    })
  }

  function removeImage(id) {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      const next = prev.filter((img) => img.id !== id)
      if (next.length && !next.some((img) => img.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true }
      }
      return next
    })
  }

  function setPrimaryImage(id) {
    setImages((prev) => prev.map((img) => ({ ...img, isPrimary: img.id === id })))
  }

  async function uploadImagesForProduct(productId, staged) {
    const ordered = [
      ...staged.filter((img) => img.isPrimary),
      ...staged.filter((img) => !img.isPrimary),
    ]
    for (let i = 0; i < ordered.length; i += 1) {
      const img = ordered[i]
      const { path, token } = await requestImageUploadUrl(productId, {
        fileName: img.file.name,
        mimeType: img.file.type || 'image/jpeg',
        sizeBytes: img.file.size,
      })
      await uploadProductImageFile(path, token, img.file)
      await recordProductImage(productId, {
        storagePath: path,
        sortOrder: i,
        isPrimary: i === 0,
        altText: form.name.trim() || undefined,
      })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.sku.trim() || !form.price) {
      toast.error('Name, SKU, and price are required.')
      return
    }

    if (!configured) {
      toast.error('Connect Supabase in .env.local to create products and upload pictures.')
      return
    }

    setSaving(true)
    try {
      const result = await createProduct({
        name: form.name.trim(),
        brandId: form.brandId || undefined,
        shortDescription: form.shortDescription || undefined,
        description: form.description || undefined,
        status: 'draft',
        isFeatured: false,
        attributes: {},
        variants: [
          {
            sku: form.sku.trim(),
            price: toMinorUnits(Number(form.price)),
            compareAtPrice: form.compareAtPrice ? toMinorUnits(Number(form.compareAtPrice)) : undefined,
            currency: form.currency,
            attributes: {},
            status: 'draft',
          },
        ],
        categoryIds: [],
        collectionIds: [],
      })

      if (images.length) {
        try {
          await uploadImagesForProduct(result.productId, images)
          toast.success(`Product created with ${images.length} picture${images.length === 1 ? '' : 's'}.`)
        } catch (imgErr) {
          toast.error(imgErr?.message ?? 'Product created, but some pictures failed to upload.')
          navigate(`/admin/products/${result.productId}`)
          return
        }
      } else {
        toast.success('Product created as draft.')
      }

      navigate(`/admin/products/${result.productId}`)
    } catch (err) {
      toast.error(err?.message ?? 'Failed to create product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <AdminBreadcrumb to="/admin/products" label="Products" />
      <header className="admin-page-header">
        <div>
          <h1>New product</h1>
          <p>Add details, a starter variant, and product pictures.</p>
        </div>
      </header>
      <AdminCard>
        <form onSubmit={handleSubmit} className="admin-form">
          <div className="form-field">
            <label className="form-label" htmlFor="name">
              Name
            </label>
            <input id="name" className="form-input" value={form.name} onChange={setField('name')} required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="brandId">
              Brand
            </label>
            <select id="brandId" className="form-select" value={form.brandId} onChange={setField('brandId')}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="shortDescription">
              Short description
            </label>
            <input
              id="shortDescription"
              className="form-input"
              value={form.shortDescription}
              onChange={setField('shortDescription')}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              className="form-input"
              rows={4}
              value={form.description}
              onChange={setField('description')}
            />
          </div>

          <h3 className="admin-form-subheading">Product pictures</h3>
          <p className="admin-muted" style={{ marginBottom: 12 }}>
            Add one or more images. The primary picture is used on the shop and product page.
          </p>

          <div className="admin-image-gallery">
            {images.map((img) => (
              <div key={img.id} className={`admin-image-tile${img.isPrimary ? ' is-primary' : ''}`}>
                <img className="admin-image-tile-thumb" src={img.previewUrl} alt={img.file.name} />
                <p className="admin-image-tile-path" title={img.file.name}>
                  {img.file.name}
                </p>
                <div className="admin-image-tile-actions">
                  {img.isPrimary ? (
                    <span className="admin-pill admin-pill-good">Primary</span>
                  ) : (
                    <button type="button" className="admin-link-btn" onClick={() => setPrimaryImage(img.id)}>
                      <Star size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                      Set primary
                    </button>
                  )}
                  <button type="button" className="admin-link-btn admin-link-btn-danger" onClick={() => removeImage(img.id)}>
                    <X size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <label className="admin-image-add-tile">
              <ImagePlus size={22} />
              <span>Add pictures</span>
              <span className="admin-image-add-hint">JPG, PNG, WebP · multiple OK</span>
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addImages(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          <h3 className="admin-form-subheading">Starter variant</h3>
          <div className="admin-form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="sku">
                SKU
              </label>
              <input id="sku" className="form-input" value={form.sku} onChange={setField('sku')} required />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="price">
                Price (PKR)
              </label>
              <input
                id="price"
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                value={form.price}
                onChange={setField('price')}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="compareAtPrice">
                Compare-at price
              </label>
              <input
                id="compareAtPrice"
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                value={form.compareAtPrice}
                onChange={setField('compareAtPrice')}
              />
            </div>
          </div>

          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Creating…' : images.length ? `Create draft + ${images.length} picture${images.length === 1 ? '' : 's'}` : 'Create draft'}
          </button>
        </form>
      </AdminCard>
    </div>
  )
}
