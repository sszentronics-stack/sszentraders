import { Link } from 'react-router-dom'

export default function Logo({ compact = false }) {
  return (
    <Link to="/" className="shrink-0 inline-flex items-center" aria-label="Aura Beauty Care home">
      <img
        src="/logo.png"
        alt="Aura Beauty Care"
        className={compact ? 'h-12 w-auto' : 'h-[72px] sm:h-[78px] w-auto'}
      />
    </Link>
  )
}
