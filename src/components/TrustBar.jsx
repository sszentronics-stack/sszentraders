import { useSiteContent } from '../lib/siteContent'

export default function TrustBar() {
  const items = useSiteContent().trust
  return (
    <ul className="ssz-trust">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
