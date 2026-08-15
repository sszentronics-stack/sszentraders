import { useEffect, useState } from 'react'

const MESSAGES = [
  'Delivery across Islamabad and Rawalpindi',
  '100% authentic products  ·  Cash on delivery available',
  'Order on WhatsApp  ·  Hero Mighty Patch is our #1 bestseller',
]

export default function AnnouncementBar() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 4200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="announcement">
      <p key={index} className="m-0">
        {MESSAGES[index]}
      </p>
    </div>
  )
}
