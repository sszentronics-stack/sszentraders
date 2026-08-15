import { PRODUCT_DISCLAIMER } from '../data/products'

export default function Disclaimer({ compact = false }) {
  return (
    <section className="disclaimer" aria-label="Product information disclaimer">
      <h3 className="text-sm font-semibold mb-2 text-ink">Product disclaimer</h3>
      <p className={compact ? 'line-clamp-5' : ''}>{PRODUCT_DISCLAIMER}</p>
    </section>
  )
}
