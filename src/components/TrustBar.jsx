import { ShieldCheck, Truck, RefreshCw, MessageCircle } from 'lucide-react'

const ITEMS = [
  { icon: ShieldCheck, title: '100% authentic product' },
  { icon: Truck, title: 'Delivery across Islamabad and Rawalpindi' },
  { icon: RefreshCw, title: '7 day easy return & exchange' },
  { icon: MessageCircle, title: 'Order on WhatsApp · COD available' },
]

export default function TrustBar() {
  return (
    <ul className="grid sm:grid-cols-2 gap-3 text-sm">
      {ITEMS.map(({ icon: Icon, title }) => (
        <li key={title} className="flex items-start gap-2.5 text-ink">
          <Icon size={18} className="mt-0.5 shrink-0 text-rose" />
          <span>{title}</span>
        </li>
      ))}
    </ul>
  )
}
