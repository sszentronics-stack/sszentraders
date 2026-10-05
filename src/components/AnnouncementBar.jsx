import { useEffect, useState } from 'react'
import { useSiteContent } from '../lib/siteContent'

export default function AnnouncementBar() {
  const messages = useSiteContent().announcements.filter(Boolean)
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState(null)

  useEffect(() => {
    if (!messages.length) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const id = setInterval(() => {
      setIndex((current) => {
        setLeaving(current)
        window.setTimeout(() => setLeaving(null), 300)
        return (current + 1) % messages.length
      })
    }, 5000)
    return () => clearInterval(id)
  }, [messages.length])

  if (!messages.length) return null

  return (
    <div className="ssz-announce" aria-live="polite">
      {messages.map((message, i) => (
        <p
          key={`${message}-${i}`}
          className={`ssz-announce__msg${i === index ? ' is-active' : ''}${i === leaving ? ' is-leaving' : ''}`}
        >
          {message}
        </p>
      ))}
    </div>
  )
}
