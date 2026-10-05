import { useSeo } from '../hooks/useSeo'

export default function About() {
  useSeo({
    title: 'About us | SS Zen Traders',
    description: 'SS Zen Traders is a skincare shop in Islamabad with a short list of authentic SADOER, Hero Cosmetics, and SOME BY MI products.',
  })

  return (
    <section className="ssz-section">
      <div className="ssz-container ssz-narrow">
        <h1>About us</h1>
        <img src="/products/mighty-patch/1.jpg" alt="Hero Mighty Patch Invisible+" width="800" height="800" style={{ margin: '24px 0' }} />
        <p>
          SS Zen Traders keeps a short list of authentic skincare: the SADOER collagen mask, Hero Mighty Patch Invisible+, and SOME BY MI 30 Days Miracle Toner.
        </p>
        <p>
          The office is at Office#14, First Floor, Farooq 2D Plaza, G-13/3, Islamabad. Call 03079594474 or email info@sszentraders.com. Every order is confirmed on WhatsApp, and cash on delivery is available.
        </p>
        <p>
          Always read the label on the product you receive. Packaging and ingredients can change, and our listings are for reference.
        </p>
      </div>
    </section>
  )
}
