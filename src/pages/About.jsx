import { useSiteContent } from '../lib/siteContent'
import { useSeo } from '../hooks/useSeo'

export default function About() {
  const { about, business } = useSiteContent()
  useSeo({
    title: `${about.title} | ${business.name}`,
    description: about.paragraphs[0],
  })

  return (
    <section className="ssz-section">
      <div className="ssz-container ssz-narrow">
        <h1>{about.title}</h1>
        <img src={about.image} alt={about.alt} width="800" height="800" style={{ margin: '24px 0' }} />
        {about.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}
