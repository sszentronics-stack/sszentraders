import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSiteContent } from '../lib/siteContent'

export default function Footer() {
  const { business } = useSiteContent()
  const [note, setNote] = useState('')
  const year = new Date().getFullYear()

  function subscribe(event) {
    event.preventDefault()
    const email = new FormData(event.currentTarget).get('email')
    window.location.href = `mailto:${business.email}?subject=${encodeURIComponent('Subscribe')}&body=${encodeURIComponent(String(email || ''))}`
    setNote('Your email app will open so you can send the subscribe request.')
  }

  return (
    <footer className="ssz-footer">
      <div className="ssz-container">
        <div className="ssz-footer__grid" data-ssz-cascade>
          <div className="ssz-reveal">
            <h2>Quick links</h2>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/shop">Shop</Link></li>
              <li><Link to="/gallery">Gallery</Link></li>
              <li><Link to="/about">About us</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div className="ssz-reveal">
            <h2>Customer care</h2>
            <ul>
              <li><Link to="/shipping">Shipping policy</Link></li>
              <li><Link to="/refund">Refunds</Link></li>
              <li><Link to="/privacy">Privacy policy</Link></li>
              <li><Link to="/terms">Terms of service</Link></li>
            </ul>
          </div>
          <div className="ssz-reveal">
            <h2>Office</h2>
            <p>
              {business.address}
              <br />
              <a href={`tel:${business.phone}`}>{business.phone}</a>
              <br />
              <a href={`mailto:${business.email}`}>{business.email}</a>
            </p>
          </div>
          <div className="ssz-reveal">
            <h2>Subscribe to our emails</h2>
            <form className="ssz-field" onSubmit={subscribe}>
              <input type="email" name="email" placeholder="Email" aria-label="Email" required />
              <button className="ssz-btn" type="submit">Subscribe</button>
            </form>
            {note && <p className="ssz-note">{note}</p>}
          </div>
        </div>
        <div className="ssz-footer__bottom">© {year} {business.name}</div>
      </div>
    </footer>
  )
}
