import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const AdminToastContext = createContext(null)

let nextId = 1

/**
 * Minimal toast/status feedback system for the admin dashboard — the
 * customer-facing app has no equivalent, so this is scoped to src/context/admin
 * rather than added to the shared app shell. Toasts auto-dismiss after a
 * few seconds; destructive/financial action confirmations are a separate
 * concern (see ConfirmDialog).
 */
export function AdminToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const push = useCallback((message, { tone = 'info', duration = 4500 } = {}) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, tone }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const value = useMemo(
    () => ({
      success: (msg, opts) => push(msg, { ...opts, tone: 'success' }),
      error: (msg, opts) => push(msg, { ...opts, tone: 'error' }),
      info: (msg, opts) => push(msg, { ...opts, tone: 'info' }),
    }),
    [push],
  )

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <div className="admin-toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`admin-toast admin-toast-${t.tone}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </AdminToastContext.Provider>
  )
}

export function useAdminToast() {
  const ctx = useContext(AdminToastContext)
  if (!ctx) throw new Error('useAdminToast must be used within AdminToastProvider')
  return ctx
}
