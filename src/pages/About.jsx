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
        <img className="ssz-about__photo" src={about.image} alt={about.alt} width="1024" height="1024" />
        {about.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}
