import { useSiteContent } from '../lib/siteContent'

function Star() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m10 1 2.7 5.8 6.3.8-4.6 4.3 1.2 6.2L10 15l-5.6 3.1 1.2-6.2L1 7.6l6.3-.8L10 1Z" />
    </svg>
  )
}

function Row({ items, reverse }) {
  const loop = [...items, ...items]
  return (
    <div className="ssz-marquee">
      <ul className={`ssz-marquee__track${reverse ? ' ssz-marquee__track--reverse' : ''}`}>
        {loop.map((item, index) => (
          <li className="ssz-marquee__item" key={`${item.text}-${index}`} aria-hidden={index >= items.length ? 'true' : undefined}>
            <img className="ssz-marquee__avatar" src={item.image} alt="" width="50" height="50" />
            <span className="ssz-marquee__rating">{item.rating} <Star /></span>
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ReviewMarquee() {
  const { heading, items } = useSiteContent().reviews
  const midpoint = Math.ceil(items.length / 2)
  return (
    <section className="ssz-section ssz-section--reviews">
      <div className="ssz-container">
        <div className="ssz-section__head" style={{ justifyContent: 'center' }}>
          <h2 className="ssz-reveal">{heading}</h2>
        </div>
      </div>
      <Row items={items.slice(0, midpoint)} />
      <Row items={items.slice(midpoint)} reverse />
    </section>
  )
}
