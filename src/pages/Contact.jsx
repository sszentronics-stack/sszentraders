import { useState } from 'react'
import { useSiteContent, whatsAppHref } from '../lib/siteContent'
import { useSeo } from '../hooks/useSeo'

export default function Contact() {
  const [sent, setSent] = useState(false)
  const { contact, business } = useSiteContent()
  useSeo({
    title: `${contact.title} | ${business.name}`,
    description: `Contact ${business.name} at the office, by email, or on WhatsApp.`,
  })

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = `Name: ${data.get('name')}\nEmail: ${data.get('email')}\nPhone: ${data.get('phone')}\n\n${data.get('message')}`
    window.location.href = `mailto:${business.email}?subject=${encodeURIComponent('Website message')}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <section className="ssz-section">
      <div className="ssz-container ssz-contact">
        <div>
          <h1>{contact.title}</h1>
          <p>{business.address}</p>
          <p><a href={`tel:${business.phone}`}>{business.phone}</a></p>
          <p><a href={`mailto:${business.email}`}>{business.email}</a></p>
          <p><a href={whatsAppHref({ business })} target="_blank" rel="noreferrer">{contact.whatsappLabel}</a></p>
        </div>
        <form className="ssz-form" onSubmit={submit}>
          <label>
            Name
            <input name="name" required autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" autoComplete="tel" />
          </label>
          <label>
            Message
            <textarea name="message" rows={5} required />
          </label>
          <button className="ssz-btn" type="submit">Send message</button>
          {sent && <p className="ssz-note">Your email app will open with this message.</p>}
        </form>
      </div>
    </section>
  )
}
