const ITEMS = ['Cash on delivery', 'WhatsApp confirmation', '7-day returns']

export default function TrustBar() {
  return (
    <ul className="ssz-trust">
      {ITEMS.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
