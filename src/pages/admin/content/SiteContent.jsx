import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../../../lib/supabase/client'
import { loadSiteContent, saveSiteContent } from '../../../lib/siteContent'

const SECTIONS = [
  ['business', 'Business'],
  ['announcement', 'Announcement'],
  ['banners', 'Banners'],
  ['home', 'Homepage'],
  ['story', 'Story'],
  ['watch', 'Watch and shop'],
  ['reviews', 'Reviews'],
  ['trust', 'Trust bar'],
  ['about', 'About'],
  ['contact', 'Contact'],
  ['policies', 'Policies'],
  ['disclaimer', 'Disclaimer'],
  ['products', 'Products'],
]

function Field({ id, label, value, onChange, rows }) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}</label>
      {rows ? (
        <textarea id={id} className="form-input" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className="form-input" value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}

export default function SiteContent() {
  const [draft, setDraft] = useState(null)
  const [section, setSection] = useState('business')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadSiteContent().then((content) => {
      if (!cancelled) setDraft(content)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function patch(recipe) {
    setDraft((current) => recipe(current))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const result = await saveSiteContent(draft)
      setDraft(result.content)
      setNotice(result.remote
        ? 'Saved. Visitors will see this copy from Supabase.'
        : 'Saved in this browser. Add the Supabase URL and anon key on your static host so every visitor sees it.')
    } catch (err) {
      setError(err?.message || 'Could not save the storefront copy.')
    } finally {
      setSaving(false)
    }
  }

  if (!draft) return <p>Loading storefront copy</p>

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 max-w-3xl">
      <div>
        <h2 className="text-xl font-medium mb-2">Storefront content</h2>
        <p className="text-sm text-ink-soft">
          Edit the words, pictures, videos, prices, and contact details that visitors see.
          The shop stays a static site. {isSupabaseConfigured()
            ? 'Supabase is connected, so a save is stored for every visitor.'
            : 'Supabase is not connected yet, so a save stays in this browser until the project URL and anon key are set.'}
        </p>
      </div>
      {error && <div className="form-banner form-banner-error">{error}</div>}
      {notice && <div className="form-banner form-banner-success">{notice}</div>}

      <div className="form-field">
        <label className="form-label" htmlFor="content-section">Section</label>
        <select id="content-section" className="form-input" value={section} onChange={(event) => setSection(event.target.value)}>
          {SECTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {section === 'business' && (
        <section>
          <Field id="biz-name" label="Store name" value={draft.business.name} onChange={(value) => patch((current) => ({ ...current, business: { ...current.business, name: value } }))} />
          <Field id="biz-address" label="Address" value={draft.business.address} onChange={(value) => patch((current) => ({ ...current, business: { ...current.business, address: value } }))} />
          <Field id="biz-phone" label="Phone" value={draft.business.phone} onChange={(value) => patch((current) => ({ ...current, business: { ...current.business, phone: value } }))} />
          <Field id="biz-email" label="Email" value={draft.business.email} onChange={(value) => patch((current) => ({ ...current, business: { ...current.business, email: value } }))} />
          <Field id="biz-whatsapp" label="WhatsApp number" value={draft.business.whatsapp} onChange={(value) => patch((current) => ({ ...current, business: { ...current.business, whatsapp: value } }))} />
          <Field id="biz-greeting" label="WhatsApp greeting" value={draft.business.whatsappGreeting} rows="3" onChange={(value) => patch((current) => ({ ...current, business: { ...current.business, whatsappGreeting: value } }))} />
        </section>
      )}

      {section === 'announcement' && draft.announcements.map((message, index) => (
        <Field key={index} id={`announce-${index}`} label={`Message ${index + 1}`} value={message} onChange={(value) => patch((current) => {
          const announcements = [...current.announcements]
          announcements[index] = value
          return { ...current, announcements }
        })} />
      ))}

      {section === 'banners' && draft.slides.map((slide, index) => (
        <section key={index}>
          <h3 className="font-medium mb-3">Banner {index + 1}</h3>
          <Field id={`slide-image-${index}`} label="Image address" value={slide.image} onChange={(value) => patch((current) => ({ ...current, slides: current.slides.map((item, i) => i === index ? { ...item, image: value } : item) }))} />
          <Field id={`slide-heading-${index}`} label="Heading" value={slide.heading} onChange={(value) => patch((current) => ({ ...current, slides: current.slides.map((item, i) => i === index ? { ...item, heading: value } : item) }))} />
          <Field id={`slide-text-${index}`} label="Text" value={slide.text} rows="3" onChange={(value) => patch((current) => ({ ...current, slides: current.slides.map((item, i) => i === index ? { ...item, text: value } : item) }))} />
          {slide.actions.map((action, actionIndex) => (
            <div className="grid sm:grid-cols-2 gap-4" key={actionIndex}>
              <Field id={`slide-${index}-label-${actionIndex}`} label="Button label" value={action.label} onChange={(value) => patch((current) => ({
                ...current,
                slides: current.slides.map((item, i) => i === index ? { ...item, actions: item.actions.map((button, j) => j === actionIndex ? { ...button, label: value } : button) } : item),
              }))} />
              <Field id={`slide-${index}-to-${actionIndex}`} label="Button link" value={action.to} onChange={(value) => patch((current) => ({
                ...current,
                slides: current.slides.map((item, i) => i === index ? { ...item, actions: item.actions.map((button, j) => j === actionIndex ? { ...button, to: value } : button) } : item),
              }))} />
            </div>
          ))}
        </section>
      ))}

      {section === 'home' && (
        <section>
          <Field id="featured" label="Featured heading" value={draft.home.featuredHeading} onChange={(value) => patch((current) => ({ ...current, home: { ...current.home, featuredHeading: value } }))} />
          <Field id="view-all" label="View all label" value={draft.home.viewAllLabel} onChange={(value) => patch((current) => ({ ...current, home: { ...current.home, viewAllLabel: value } }))} />
          <Field id="brand-heading" label="Brand heading" value={draft.home.brandHeading} onChange={(value) => patch((current) => ({ ...current, home: { ...current.home, brandHeading: value } }))} />
          <h3 className="font-medium mb-3">Story circles</h3>
          {draft.stories.map((item, index) => (
            <div className="grid sm:grid-cols-3 gap-4" key={index}>
              <Field id={`story-circle-label-${index}`} label="Label" value={item.label} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, label: value } : card) }))} />
              <Field id={`story-circle-to-${index}`} label="Link" value={item.to} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, to: value } : card) }))} />
              <Field id={`story-circle-image-${index}`} label="Image" value={item.image} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, image: value } : card) }))} />
            </div>
          ))}
          <h3 className="font-medium mb-3">Brand cards</h3>
          {draft.brands.map((item, index) => (
            <div className="grid sm:grid-cols-3 gap-4" key={index}>
              <Field id={`brand-label-${index}`} label="Label" value={item.label} onChange={(value) => patch((current) => ({ ...current, brands: current.brands.map((card, i) => i === index ? { ...card, label: value } : card) }))} />
              <Field id={`brand-to-${index}`} label="Link" value={item.to} onChange={(value) => patch((current) => ({ ...current, brands: current.brands.map((card, i) => i === index ? { ...card, to: value } : card) }))} />
              <Field id={`brand-image-${index}`} label="Image" value={item.image} onChange={(value) => patch((current) => ({ ...current, brands: current.brands.map((card, i) => i === index ? { ...card, image: value } : card) }))} />
            </div>
          ))}
        </section>
      )}

      {section === 'story' && (
        <section>
          <Field id="story-image" label="Image address" value={draft.story.image} onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, image: value } }))} />
          <Field id="story-alt" label="Image description" value={draft.story.alt} onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, alt: value } }))} />
          <Field id="story-heading" label="Heading" value={draft.story.heading} onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, heading: value } }))} />
          <Field id="story-text" label="Text" value={draft.story.text} rows="4" onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, text: value } }))} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="story-link-label" label="Link label" value={draft.story.linkLabel} onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, linkLabel: value } }))} />
            <Field id="story-link" label="Link" value={draft.story.linkTo} onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, linkTo: value } }))} />
          </div>
        </section>
      )}

      {section === 'watch' && (
        <section>
          <Field id="watch-heading" label="Heading" value={draft.watch.heading} onChange={(value) => patch((current) => ({ ...current, watch: { ...current.watch, heading: value } }))} />
          <Field id="watch-lead" label="Lead" value={draft.watch.lead} onChange={(value) => patch((current) => ({ ...current, watch: { ...current.watch, lead: value } }))} />
          {Object.entries(draft.watch.clips).map(([slug, clip]) => (
            <Field key={slug} id={`clip-${slug}`} label={draft.products.find((product) => product.slug === slug)?.name || slug} value={clip} onChange={(value) => patch((current) => ({ ...current, watch: { ...current.watch, clips: { ...current.watch.clips, [slug]: value } } }))} />
          ))}
        </section>
      )}

      {section === 'reviews' && (
        <section>
          <Field id="reviews-heading" label="Heading" value={draft.reviews.heading} onChange={(value) => patch((current) => ({ ...current, reviews: { ...current.reviews, heading: value } }))} />
          {draft.reviews.items.map((item, index) => (
            <div key={index} className="grid gap-4 mb-4">
              <Field id={`review-text-${index}`} label={`Review ${index + 1}`} value={item.text} rows="2" onChange={(value) => patch((current) => ({ ...current, reviews: { ...current.reviews, items: current.reviews.items.map((review, i) => i === index ? { ...review, text: value } : review) } }))} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id={`review-rating-${index}`} label="Stars" value={item.rating} onChange={(value) => patch((current) => ({ ...current, reviews: { ...current.reviews, items: current.reviews.items.map((review, i) => i === index ? { ...review, rating: value } : review) } }))} />
                <Field id={`review-image-${index}`} label="Image" value={item.image} onChange={(value) => patch((current) => ({ ...current, reviews: { ...current.reviews, items: current.reviews.items.map((review, i) => i === index ? { ...review, image: value } : review) } }))} />
              </div>
            </div>
          ))}
        </section>
      )}

      {section === 'trust' && draft.trust.map((item, index) => (
        <Field key={index} id={`trust-${index}`} label={`Item ${index + 1}`} value={item} onChange={(value) => patch((current) => {
          const trust = [...current.trust]
          trust[index] = value
          return { ...current, trust }
        })} />
      ))}

      {section === 'about' && (
        <section>
          <Field id="about-title" label="Title" value={draft.about.title} onChange={(value) => patch((current) => ({ ...current, about: { ...current.about, title: value } }))} />
          <Field id="about-image" label="Image address" value={draft.about.image} onChange={(value) => patch((current) => ({ ...current, about: { ...current.about, image: value } }))} />
          <Field id="about-alt" label="Image description" value={draft.about.alt} onChange={(value) => patch((current) => ({ ...current, about: { ...current.about, alt: value } }))} />
          {draft.about.paragraphs.map((paragraph, index) => (
            <Field key={index} id={`about-p-${index}`} label={`Paragraph ${index + 1}`} value={paragraph} rows="4" onChange={(value) => patch((current) => ({ ...current, about: { ...current.about, paragraphs: current.about.paragraphs.map((item, i) => i === index ? value : item) } }))} />
          ))}
        </section>
      )}

      {section === 'contact' && (
        <section>
          <Field id="contact-title" label="Page title" value={draft.contact.title} onChange={(value) => patch((current) => ({ ...current, contact: { ...current.contact, title: value } }))} />
          <Field id="contact-wa" label="WhatsApp link label" value={draft.contact.whatsappLabel} onChange={(value) => patch((current) => ({ ...current, contact: { ...current.contact, whatsappLabel: value } }))} />
        </section>
      )}

      {section === 'policies' && Object.entries(draft.policies).map(([key, page]) => (
        <section key={key}>
          <Field id={`${key}-title`} label={`${page.title} title`} value={page.title} onChange={(value) => patch((current) => ({ ...current, policies: { ...current.policies, [key]: { ...current.policies[key], title: value } } }))} />
          <Field id={`${key}-body`} label="Text" value={page.body} rows="8" onChange={(value) => patch((current) => ({ ...current, policies: { ...current.policies, [key]: { ...current.policies[key], body: value } } }))} />
        </section>
      ))}

      {section === 'disclaimer' && (
        <Field id="disclaimer" label="Product disclaimer" value={draft.disclaimer} rows="8" onChange={(value) => patch((current) => ({ ...current, disclaimer: value }))} />
      )}

      {section === 'products' && draft.products.map((product, index) => (
        <section key={product.slug}>
          <h3 className="font-medium mb-3">{product.name}</h3>
          <Field id={`${product.slug}-name`} label="Name" value={product.name} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, name: value } : item) }))} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id={`${product.slug}-price`} label="Price" value={product.price} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, price: value } : item) }))} />
            <Field id={`${product.slug}-compare`} label="Compare-at price" value={product.compareAt} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, compareAt: value } : item) }))} />
          </div>
          <Field id={`${product.slug}-tagline`} label="Tagline" value={product.tagline} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, tagline: value } : item) }))} />
          <Field id={`${product.slug}-description`} label="Description" value={product.description} rows="5" onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, description: value } : item) }))} />
          <Field id={`${product.slug}-image`} label="First image" value={product.image} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, image: value } : item) }))} />
        </section>
      ))}

      <button type="submit" className="btn-lavender w-auto px-8" disabled={saving}>
        {saving ? 'Saving' : 'Save storefront'}
      </button>
    </form>
  )
}
