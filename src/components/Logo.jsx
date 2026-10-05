import { Link } from 'react-router-dom'
import { useSiteContent } from '../lib/siteContent'

export default function Logo() {
  const name = useSiteContent().business.name
  return (
    <Link to="/" className="ssz-logo" aria-label={`${name} home`}>
      <img src="/logo.png" alt="" width="52" height="52" />
    </Link>
  )
}
