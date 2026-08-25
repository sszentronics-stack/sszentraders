import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

let nextId = 1

/**
 * Minimal toast/status feedback system for the customer-facing storefront —
 * mirrors src/context/admin/AdminToastContext.jsx. Exists because several
 * actions (wishlist toggle, share-link fallback) previously failed or
 * succeeded silently with no visible confirmation.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    if (timers.current[id]) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
  }, [])

  const push = useCallback((message, { tone = 'info', duration = 3500 } = {}) => {
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
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
