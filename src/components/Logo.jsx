import { Link } from 'react-router-dom'

export default function Logo() {
  return (
    <Link to="/" className="ssz-logo" aria-label="SS Zen Traders home">
      <img src="/logo.png" alt="" width="52" height="52" />
    </Link>
  )
}
