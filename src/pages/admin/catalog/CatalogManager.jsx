import { useEffect, useState } from 'react'
import { AdminCard, EmptyState, ErrorState, LoadingState, StatusPill } from '../../../components/admin/ui'
import { useAdminToast } from '../../../context/admin/AdminToastContext'
import {
  listAllBrands, listAllCategories, listAllCollections,
  createCatalogEntity, updateCatalogEntity, setCatalogEntityStatus,
} from '../../../repositories/admin/catalog.admin.repository'

const TABS = [
  { key: 'brands', label: 'Brands', loader: listAllBrands },
  { key: 'categories', label: 'Categories', loader: listAllCategories },
  { key: 'collections', label: 'Collections', loader: listAllCollections },
]

export default function CatalogManager() {
  const [tab, setTab] = useState('brands')
  const [state, setState] = useState({ status: 'loading', items: [] })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const toast = useAdminToast()

  const active = TABS.find((t) => t.key === tab)

  function reload() {
    setState({ status: 'loading', items: [] })
    active
      .loader()
      .then((items) => setState({ status: 'ok', items }))
      .catch((err) => setState({ status: 'error', items: [], error: err?.message }))
  }

  useEffect(reload, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await createCatalogEntity(tab, { name: name.trim(), status: 'draft', sortOrder: 0 })
      toast.success('Created.')
      setName('')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to create.')
    } finally {
      setCreating(false)
    }
  }

  async function handleStatus(id, action) {
    try {
      await setCatalogEntityStatus(tab, id, action)
      toast.success('Updated.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to update.')
    }
  }

  async function handleRename(id, currentName) {
    const nextName = window.prompt('New name', currentName)
    if (!nextName || nextName === currentName) return
    try {
      await updateCatalogEntity(tab, id, { name: nextName })
      toast.success('Renamed.')
      reload()
    } catch (err) {
      toast.error(err?.message ?? 'Failed to rename.')
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <h1>Brands & Categories</h1>
      </header>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <AdminCard>
        <form onSubmit={handleCreate} className="admin-form-inline">
          <input className="form-input" placeholder={`New ${active.label.toLowerCase().replace(/s$/, '')} name`} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="admin-btn admin-btn-primary" disabled={creating}>
            {creating ? 'Adding…' : 'Add'}
          </button>
        </form>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.error} onRetry={reload} />}
        {state.status === 'ok' && state.items.length === 0 && <EmptyState>Nothing here yet.</EmptyState>}
        {state.status === 'ok' && state.items.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Slug</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.slug}</td>
                    <td><StatusPill status={item.status} /></td>
                    <td className="admin-table-actions">
                      <button type="button" className="admin-link-btn" onClick={() => handleRename(item.id, item.name)}>Rename</button>
                      {item.status !== 'published' && <button type="button" className="admin-link-btn" onClick={() => handleStatus(item.id, 'publish')}>Publish</button>}
                      {item.status === 'published' && <button type="button" className="admin-link-btn" onClick={() => handleStatus(item.id, 'unpublish')}>Unpublish</button>}
                      {item.status !== 'archived' && <button type="button" className="admin-link-btn admin-link-btn-danger" onClick={() => handleStatus(item.id, 'archive')}>Archive</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  )
}
