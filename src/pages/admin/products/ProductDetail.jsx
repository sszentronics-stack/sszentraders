import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminBreadcrumb, AdminCard, ErrorState, LoadingState, StatusPill, useConfirm } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import {
  getAdminProduct, updateProduct, setProductStatus, addVariant, updateVariant, archiveVariant,
  requestImageUploadUrl, uploadProductImageFile, recordProductImage, setPrimaryProductImage, removeProductImage,
} from '../../../repositories/admin/products.admin.repository'
import { formatMoney, toMinorUnits } from '../../../../backend/lib/money/index'
import { getPublicImageUrl } from '../../../lib/supabase/storage'

export default function ProductDetail() {
  const { id } = useParams()
  const toast = useAdminToast()
  const { confirm, dialog } = useConfirm()
  const [state, setState] = useState({ status: 'loading', product: null, error: null })
  const [saving, setSaving] = useState(false)
  const [newVariant, setNewVariant] = useState({ sku: '', title: '', price: '', compareAtPrice: '' })
  const [uploading, setUploading] = useState(false)

  async function reload() {
    try {
      const product = await getAdminProduct(id)
      setState({ status: 'ok', product, error: null })
    } catch (err) {
      setState({ status: 'error', product: null, error: err?.message })
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (state.status === 'loading') return <div className="admin-page"><LoadingState /></div>
  if (state.status === 'error') return <div className="admin-page"><ErrorState message={state.error} onRetry={reload} /></div>
  if (!state.product) return <div className="admin-page"><ErrorState message="Product not found." /></div>

  const p = state.product

  async function handleFieldSave(patch) {
    setSaving(true)
    try {
      await updateProduct(id, patch)
      toast.success('Saved.')
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(action) {
    const ok = await confirm({
      title: `${action[0].toUpperCase()}${action.slice(1)} this product?`,
      body: action === 'archive' ? 'Archived products are hidden everywhere and keep their history.' : undefined,
      confirmLabel: action[0].toUpperCase() + action.slice(1),
      danger: action === 'archive',
    })
    if (!ok) return
    try {
      await setProductStatus(id, action)
      toast.success(`Product ${action}ed.`)
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Action failed.')
    }
  }

  async function handleAddVariant(e) {
    e.preventDefault()
    if (!newVariant.sku.trim() || !newVariant.price) {
      toast.error('SKU and price are required.')
      return
    }
    try {
      await addVariant(id, {
        sku: newVariant.sku.trim(),
        title: newVariant.title || undefined,
        price: toMinorUnits(Number(newVariant.price)),
        compareAtPrice: newVariant.compareAtPrice ? toMinorUnits(Number(newVariant.compareAtPrice)) : undefined,
        currency: 'PKR',
        attributes: {},
        status: 'draft',
      })
      toast.success('Variant added.')
      setNewVariant({ sku: '', title: '', price: '', compareAtPrice: '' })
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to add variant.')
    }
  }

  async function handleVariantStatus(variantId, status) {
    try {
      await updateVariant(id, variantId, { status })
      toast.success('Variant updated.')
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to update variant.')
    }
  }

  async function handleArchiveVariant(variantId) {
    const ok = await confirm({ title: 'Archive this variant?', confirmLabel: 'Archive', danger: true })
    if (!ok) return
    try {
      await archiveVariant(id, variantId)
      toast.success('Variant archived.')
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to archive variant.')
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { path, token } = await requestImageUploadUrl(id, { fileName: file.name, mimeType: file.type, sizeBytes: file.size })
      await uploadProductImageFile(path, token, file)
      await recordProductImage(id, { storagePath: path, sortOrder: p.product_images?.length ?? 0, isPrimary: (p.product_images ?? []).length === 0 })
      toast.success('Image uploaded.')
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to upload image.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleSetPrimary(imageId) {
    try {
      await setPrimaryProductImage(id, imageId)
      toast.success('Primary image updated.')
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to update.')
    }
  }

  async function handleRemoveImage(imageId) {
    const ok = await confirm({ title: 'Remove this image?', confirmLabel: 'Remove', danger: true })
    if (!ok) return
    try {
      await removeProductImage(id, imageId)
      toast.success('Image removed.')
      await reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to remove image.')
    }
  }

  return (
    <div className="admin-page">
      {dialog}
      <AdminBreadcrumb to="/admin/products" label="Products" />
      <header className="admin-page-header">
        <h1>{p.name}</h1>
        <div className="admin-header-actions">
          <StatusPill status={p.status} />
          {p.status !== 'published' && (
            <button type="button" className="admin-btn admin-btn-primary" onClick={() => handleStatusChange('publish')}>Publish</button>
          )}
          {p.status === 'published' && (
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => handleStatusChange('unpublish')}>Unpublish</button>
          )}
          {p.status !== 'archived' && (
            <button type="button" className="admin-btn admin-btn-danger" onClick={() => handleStatusChange('archive')}>Archive</button>
          )}
        </div>
      </header>

      <AdminCard title="Details">
        <ProductFields product={p} saving={saving} onSave={handleFieldSave} />
      </AdminCard>

      <AdminCard title={`Variants (${(p.product_variants ?? []).length})`}>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>SKU</th><th>Title</th><th>Price</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {(p.product_variants ?? []).map((v) => (
                <tr key={v.id}>
                  <td>{v.sku}</td>
                  <td>{v.title ?? '—'}</td>
                  <td>{formatMoney(v.price, { currency: v.currency })}</td>
                  <td><StatusPill status={v.status} /></td>
                  <td className="admin-table-actions">
                    {v.status !== 'published' && <button type="button" className="admin-link-btn" onClick={() => handleVariantStatus(v.id, 'published')}>Publish</button>}
                    {v.status === 'published' && <button type="button" className="admin-link-btn" onClick={() => handleVariantStatus(v.id, 'draft')}>Unpublish</button>}
                    {v.status !== 'archived' && <button type="button" className="admin-link-btn admin-link-btn-danger" onClick={() => handleArchiveVariant(v.id)}>Archive</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={handleAddVariant} className="admin-form-row admin-form-inline">
          <input className="form-input" placeholder="SKU" value={newVariant.sku} onChange={(e) => setNewVariant((v) => ({ ...v, sku: e.target.value }))} />
          <input className="form-input" placeholder="Title (optional)" value={newVariant.title} onChange={(e) => setNewVariant((v) => ({ ...v, title: e.target.value }))} />
          <input className="form-input" placeholder="Price" type="number" min="0" step="0.01" value={newVariant.price} onChange={(e) => setNewVariant((v) => ({ ...v, price: e.target.value }))} />
          <input className="form-input" placeholder="Compare-at" type="number" min="0" step="0.01" value={newVariant.compareAtPrice} onChange={(e) => setNewVariant((v) => ({ ...v, compareAtPrice: e.target.value }))} />
          <button type="submit" className="admin-btn admin-btn-primary">Add variant</button>
        </form>
      </AdminCard>

      <AdminCard title="Images">
        <div className="admin-image-gallery">
          {(p.product_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order).map((img) => (
            <div key={img.id} className={`admin-image-tile ${img.is_primary ? 'is-primary' : ''}`}>
              <img
                className="admin-image-tile-thumb"
                src={getPublicImageUrl('product-images', img.storage_path)}
                alt={img.alt_text ?? ''}
                title={img.storage_path}
              />
              <div className="admin-image-tile-actions">
                {!img.is_primary && <button type="button" className="admin-link-btn" onClick={() => handleSetPrimary(img.id)}>Set primary</button>}
                {img.is_primary && <span className="admin-pill admin-pill-good">Primary</span>}
                <button type="button" className="admin-link-btn admin-link-btn-danger" onClick={() => handleRemoveImage(img.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <label className="admin-btn admin-btn-ghost admin-upload-btn">
          {uploading ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} hidden />
        </label>
      </AdminCard>
    </div>
  )
}

function ProductFields({ product, saving, onSave }) {
  const [form, setForm] = useState({
    name: product.name, shortDescription: product.short_description ?? '', description: product.description ?? '',
    seoTitle: product.seo_title ?? '', seoDescription: product.seo_description ?? '', isFeatured: product.is_featured,
  })
  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({
          name: form.name,
          shortDescription: form.shortDescription || undefined,
          description: form.description || undefined,
          seoTitle: form.seoTitle || undefined,
          seoDescription: form.seoDescription || undefined,
          isFeatured: form.isFeatured,
        })
      }}
    >
      <div className="form-field">
        <label className="form-label">Name</label>
        <input className="form-input" value={form.name} onChange={setField('name')} />
      </div>
      <div className="form-field">
        <label className="form-label">Short description</label>
        <input className="form-input" value={form.shortDescription} onChange={setField('shortDescription')} />
      </div>
      <div className="form-field">
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={4} value={form.description} onChange={setField('description')} />
      </div>
      <div className="admin-form-row">
        <div className="form-field">
          <label className="form-label">SEO title</label>
          <input className="form-input" value={form.seoTitle} onChange={setField('seoTitle')} />
        </div>
        <div className="form-field">
          <label className="form-label">SEO description</label>
          <input className="form-input" value={form.seoDescription} onChange={setField('seoDescription')} />
        </div>
      </div>
      <label className="form-checkbox-row">
        <input type="checkbox" checked={form.isFeatured} onChange={setField('isFeatured')} />
        Featured on homepage
      </label>
      <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
