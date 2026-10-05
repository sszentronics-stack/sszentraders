const REVIEWS = [
  { image: '/products/sadoer-collagen/1.png', rating: 5, text: 'The collagen mask left my skin soft by morning.' },
  { image: '/products/mighty-patch/1.jpg', rating: 5, text: 'Mighty Patch stays flat and is easy to wear out.' },
  { image: '/products/some-by-mi/1.jpg', rating: 5, text: 'The SOME BY MI toner is gentle enough for every day.' },
  { image: '/products/sadoer-collagen/2.png', rating: 4, text: 'The sheet sits close to the face and feels light.' },
]

const SECOND_ROW = [
  { image: '/products/mighty-patch/2.jpg', rating: 5, text: 'The patch is thin enough to wear in the daytime.' },
  { image: '/products/some-by-mi/2.jpg', rating: 4, text: 'A clear toner step I can use on a cotton pad.' },
  { image: '/products/sadoer-collagen/3.png', rating: 5, text: 'I use the collagen mask two evenings a week.' },
  { image: '/products/mighty-patch/3.jpg', rating: 5, text: 'Cash on delivery and a WhatsApp confirmation made ordering simple.' },
]

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
  return (
    <section className="ssz-section">
      <div className="ssz-container">
        <div className="ssz-section__head" style={{ justifyContent: 'center' }}>
          <h2 className="ssz-reveal">What customers say</h2>
        </div>
      </div>
      <Row items={REVIEWS} />
      <Row items={SECOND_ROW} reverse />
    </section>
  )
}
