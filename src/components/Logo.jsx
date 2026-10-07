import { Link } from 'react-router-dom'
import { useSiteContent } from '../lib/siteContent'

export default function Logo() {
  const { business, logo } = useSiteContent()
  return (
    <Link to="/" className="ssz-logo" aria-label={`${business.name} home`}>
      <img src={logo || '/logo.png'} alt="" width="1024" height="223" />
    </Link>
  )
}
