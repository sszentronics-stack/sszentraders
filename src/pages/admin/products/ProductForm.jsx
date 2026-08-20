import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminBreadcrumb, AdminCard } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import { createProduct } from '../../../repositories/admin/products.admin.repository'
import { listAllBrands } from '../../../repositories/admin/catalog.admin.repository'
import { toMinorUnits } from '../../../../backend/lib/money/index'

/**
 * Minimal product creation form: enough fields + one starter variant to
 * satisfy createProductSchema (which requires >= 1 variant). Everything
 * else — additional variants, images, categories/collections, publish
 * state — is managed on the product detail page after creation, since
 * those each have their own dedicated Edge Function endpoints.
 */
export default function ProductForm() {
  const navigate = useNavigate()
  const toast = useAdminToast()
  const [brands, setBrands] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', brandId: '', shortDescription: '', description: '',
    sku: '', price: '', compareAtPrice: '', currency: 'PKR',
  })

  useEffect(() => {
    listAllBrands().then(setBrands).catch(() => setBrands([]))
  }, [])

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.sku.trim() || !form.price) {
      toast.error('Name, SKU, and price are required.')
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
      toast.success('Product created as draft.')
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
        <h1>New product</h1>
      </header>
      <AdminCard>
        <form onSubmit={handleSubmit} className="admin-form">
          <div className="form-field">
            <label className="form-label" htmlFor="name">Name</label>
            <input id="name" className="form-input" value={form.name} onChange={setField('name')} required />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="brandId">Brand</label>
            <select id="brandId" className="form-select" value={form.brandId} onChange={setField('brandId')}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="shortDescription">Short description</label>
            <input id="shortDescription" className="form-input" value={form.shortDescription} onChange={setField('shortDescription')} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="description">Description</label>
            <textarea id="description" className="form-input" rows={4} value={form.description} onChange={setField('description')} />
          </div>

          <h3 className="admin-form-subheading">Starter variant</h3>
          <div className="admin-form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="sku">SKU</label>
              <input id="sku" className="form-input" value={form.sku} onChange={setField('sku')} required />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="price">Price (PKR)</label>
              <input id="price" type="number" min="0" step="0.01" className="form-input" value={form.price} onChange={setField('price')} required />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="compareAtPrice">Compare-at price</label>
              <input id="compareAtPrice" type="number" min="0" step="0.01" className="form-input" value={form.compareAtPrice} onChange={setField('compareAtPrice')} />
            </div>
          </div>

          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create draft'}
          </button>
        </form>
      </AdminCard>
    </div>
  )
}
