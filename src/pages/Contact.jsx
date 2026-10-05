import { useState } from 'react'
import { WHATSAPP_LINK } from '../data/products'
import { useSeo } from '../hooks/useSeo'

export default function Contact() {
  const [sent, setSent] = useState(false)
  useSeo({
    title: 'Contact | SS Zen Traders',
    description: 'Contact SS Zen Traders at the Islamabad office, by email, or on WhatsApp.',
  })

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const body = `Name: ${data.get('name')}\nEmail: ${data.get('email')}\nPhone: ${data.get('phone')}\n\n${data.get('message')}`
    window.location.href = `mailto:info@sszentraders.com?subject=${encodeURIComponent('Website message')}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <section className="ssz-section">
      <div className="ssz-container ssz-contact">
        <div>
          <h1>Contact</h1>
          <p>Office#14, First Floor, Farooq 2D Plaza, G-13/3, Islamabad</p>
          <p><a href="tel:03079594474">03079594474</a></p>
          <p><a href="mailto:info@sszentraders.com">info@sszentraders.com</a></p>
          <p><a href={WHATSAPP_LINK} target="_blank" rel="noreferrer">Chat on WhatsApp</a></p>
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
