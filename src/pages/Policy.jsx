import { Navigate, useLocation } from 'react-router-dom'
import { useSiteContent } from '../lib/siteContent'

export default function Policy() {
  const key = useLocation().pathname.replace(/^\//, '')
  const page = useSiteContent().policies[key]
  if (!page) return <Navigate to="/" replace />

  return (
    <div className="container-aura py-12 md:py-16 max-w-3xl">
      <h1 className="text-4xl font-medium mb-6">{page.title}</h1>
      <p className="leading-relaxed text-ink-soft whitespace-pre-line">{page.body}</p>
    </div>
  )
}
