import { Link } from 'react-router-dom'

export default function Logo({ compact = false }) {
  return (
    <Link to="/" className="shrink-0 inline-flex items-center" aria-label="SS Zen Traders home">
      <img
        src="/logo.png?v=original"
        alt="SS Zen Traders"
        className={compact ? 'h-12 w-12 rounded-full object-cover' : 'h-[72px] sm:h-[78px] w-[72px] sm:w-[78px] rounded-full object-cover'}
      />
    </Link>
  )
}
