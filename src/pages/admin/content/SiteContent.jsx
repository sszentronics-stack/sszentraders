import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../../../lib/supabase/client'
import { SITE_CONTENT_LIMITS, loadSiteContent, saveSiteContent, uploadSiteAsset } from '../../../lib/siteContent'

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

function ImageField({ id, label, value, folder, kind = 'image', onChange }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const isVideo = kind === 'video'

  async function onFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      onChange(await uploadSiteAsset(file, folder))
    } catch (err) {
      setUploadError(err?.message || 'Could not upload the file.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>{label}</label>
      {value && isVideo ? (
        <video src={value} muted playsInline width="160" height="90" style={{ display: 'block', width: 160, height: 90, objectFit: 'contain', marginBottom: 8, background: '#f3f3f3' }} />
      ) : null}
      {value && !isVideo ? (
        <img src={value} alt="" width="160" height="90" style={{ display: 'block', width: 160, height: 90, objectFit: 'contain', marginBottom: 8, background: '#f3f3f3' }} />
      ) : null}
      <input id={id} className="form-input" value={value || ''} onChange={(event) => onChange(event.target.value)} />
      <div className="admin-image-tile-actions" style={{ marginTop: 8 }}>
        <label className="admin-btn admin-btn-ghost admin-upload-btn">
          {uploading ? 'Uploading…' : isVideo ? 'Upload video' : 'Upload image'}
          <input
            type="file"
            accept={isVideo ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'}
            hidden
            onChange={onFile}
            disabled={uploading}
          />
        </label>
        {value ? (
          <button type="button" className="admin-btn admin-btn-danger" onClick={() => onChange('')}>Remove</button>
        ) : null}
      </div>
      {uploadError ? <p className="form-error">{uploadError}</p> : null}
    </div>
  )
}

function moveItem(list, index, step) {
  const target = index + step
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

function ItemActions({ index, length, onMove, onRemove }) {
  return (
    <div className="admin-image-tile-actions" style={{ marginBottom: 12 }}>
      <button type="button" className="admin-btn admin-btn-ghost" disabled={index === 0} onClick={() => onMove(index, -1)}>Move up</button>
      <button type="button" className="admin-btn admin-btn-ghost" disabled={index === length - 1} onClick={() => onMove(index, 1)}>Move down</button>
      <button type="button" className="admin-btn admin-btn-danger" onClick={() => onRemove(index)}>Remove</button>
    </div>
  )
}

export default function SiteContent() {
  const [draft, setDraft] = useState(null)
  const [section, setSection] = useState('business')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [clipSlug, setClipSlug] = useState('')

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
          <ImageField id="logo" label="Header logo" folder="logo" value={draft.logo} onChange={(value) => patch((current) => ({ ...current, logo: value }))} />
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

      {section === 'banners' && (
        <section>
          {draft.slides.map((slide, index) => (
            <section key={index}>
              <h3 className="font-medium mb-3">Banner {index + 1}</h3>
              <ItemActions
                index={index}
                length={draft.slides.length}
                onMove={(itemIndex, step) => patch((current) => ({ ...current, slides: moveItem(current.slides, itemIndex, step) }))}
                onRemove={(itemIndex) => patch((current) => ({ ...current, slides: current.slides.filter((_, i) => i !== itemIndex) }))}
              />
              <ImageField id={`slide-image-${index}`} label="Banner image" folder="banners" value={slide.image} onChange={(value) => patch((current) => ({ ...current, slides: current.slides.map((item, i) => i === index ? { ...item, image: value } : item) }))} />
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
          {draft.slides.length < SITE_CONTENT_LIMITS.slides && (
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              onClick={() => patch((current) => ({
                ...current,
                slides: [...current.slides, { image: '', heading: 'New banner', text: '', actions: [{ label: 'Get this product', to: '/shop' }] }],
              }))}
            >
              Add banner
            </button>
          )}
        </section>
      )}

      {section === 'home' && (
        <section>
          <Field id="featured" label="Featured heading" value={draft.home.featuredHeading} onChange={(value) => patch((current) => ({ ...current, home: { ...current.home, featuredHeading: value } }))} />
          <Field id="view-all" label="View all label" value={draft.home.viewAllLabel} onChange={(value) => patch((current) => ({ ...current, home: { ...current.home, viewAllLabel: value } }))} />
          <Field id="brand-heading" label="Brand heading" value={draft.home.brandHeading} onChange={(value) => patch((current) => ({ ...current, home: { ...current.home, brandHeading: value } }))} />
          <h3 className="font-medium mb-3">Story circles</h3>
          {draft.stories.map((item, index) => (
            <section key={index}>
              <h4 className="font-medium mb-2">{item.label || `Story ${index + 1}`}</h4>
              <ItemActions
                index={index}
                length={draft.stories.length}
                onMove={(itemIndex, step) => patch((current) => ({ ...current, stories: moveItem(current.stories, itemIndex, step) }))}
                onRemove={(itemIndex) => patch((current) => ({ ...current, stories: current.stories.filter((_, i) => i !== itemIndex) }))}
              />
              <Field id={`story-circle-label-${index}`} label="Label" value={item.label} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, label: value } : card) }))} />
              <Field id={`story-circle-to-${index}`} label="Product link" value={item.to} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, to: value } : card) }))} />
              <div className="form-field">
                <label className="form-label" htmlFor={`story-type-${index}`}>Story type</label>
                <select
                  id={`story-type-${index}`}
                  className="form-input"
                  value={item.mediaType === 'video' ? 'video' : 'image'}
                  onChange={(event) => patch((current) => ({
                    ...current,
                    stories: current.stories.map((card, i) => i === index ? { ...card, mediaType: event.target.value } : card),
                  }))}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <ImageField id={`story-circle-image-${index}`} label="Circle thumbnail" folder="stories" value={item.image} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, image: value } : card) }))} />
              {item.mediaType === 'video' ? (
                <ImageField id={`story-video-${index}`} label="Story video" folder="stories" kind="video" value={item.storyVideo} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, storyVideo: value } : card) }))} />
              ) : (
                <ImageField id={`story-photo-${index}`} label="Story photo" folder="stories" value={item.storyImage} onChange={(value) => patch((current) => ({ ...current, stories: current.stories.map((card, i) => i === index ? { ...card, storyImage: value } : card) }))} />
              )}
            </section>
          ))}
          {draft.stories.length < SITE_CONTENT_LIMITS.stories && (
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              onClick={() => patch((current) => ({
                ...current,
                stories: [...current.stories, { label: 'New story', to: '/shop', image: '', storyImage: '', mediaType: 'image', storyVideo: '' }],
              }))}
            >
              Add story
            </button>
          )}
          <h3 className="font-medium mb-3">Brand circles</h3>
          {draft.brands.map((item, index) => (
            <section key={index}>
              <h4 className="font-medium mb-2">{item.label || `Brand ${index + 1}`}</h4>
              <ItemActions
                index={index}
                length={draft.brands.length}
                onMove={(itemIndex, step) => patch((current) => ({ ...current, brands: moveItem(current.brands, itemIndex, step) }))}
                onRemove={(itemIndex) => patch((current) => ({ ...current, brands: current.brands.filter((_, i) => i !== itemIndex) }))}
              />
              <Field id={`brand-label-${index}`} label="Label" value={item.label} onChange={(value) => patch((current) => ({ ...current, brands: current.brands.map((card, i) => i === index ? { ...card, label: value } : card) }))} />
              <Field id={`brand-to-${index}`} label="Shop link" value={item.to} onChange={(value) => patch((current) => ({ ...current, brands: current.brands.map((card, i) => i === index ? { ...card, to: value } : card) }))} />
              <ImageField id={`brand-image-${index}`} label="Circle image" folder="brands" value={item.image} onChange={(value) => patch((current) => ({ ...current, brands: current.brands.map((card, i) => i === index ? { ...card, image: value } : card) }))} />
            </section>
          ))}
          {draft.brands.length < SITE_CONTENT_LIMITS.brands && (
            <button
              type="button"
              className="admin-btn admin-btn-ghost"
              onClick={() => patch((current) => ({
                ...current,
                brands: [...current.brands, { label: 'New brand', to: '/shop', image: '' }],
              }))}
            >
              Add brand
            </button>
          )}
        </section>
      )}

      {section === 'story' && (
        <section>
          <ImageField id="story-image" label="Story image" folder="story" value={draft.story.image} onChange={(value) => patch((current) => ({ ...current, story: { ...current.story, image: value } }))} />
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
            <section key={slug}>
              <h3 className="font-medium mb-3">{draft.products.find((product) => product.slug === slug)?.name || slug}</h3>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                style={{ marginBottom: 12 }}
                onClick={() => patch((current) => {
                  const clips = { ...current.watch.clips }
                  delete clips[slug]
                  return { ...current, watch: { ...current.watch, clips } }
                })}
              >
                Remove video
              </button>
              <ImageField
                id={`clip-${slug}`}
                label="Video"
                folder="videos"
                kind="video"
                value={clip}
                onChange={(value) => patch((current) => {
                  const clips = { ...current.watch.clips }
                  if (value) clips[slug] = value
                  else delete clips[slug]
                  return { ...current, watch: { ...current.watch, clips } }
                })}
              />
            </section>
          ))}
          {draft.products.some((product) => !(product.slug in draft.watch.clips)) && (
            <div className="admin-image-tile-actions">
              <div className="form-field" style={{ margin: 0, minWidth: 220 }}>
                <label className="form-label" htmlFor="add-clip">Add a product video</label>
                <select id="add-clip" className="form-input" value={clipSlug} onChange={(event) => setClipSlug(event.target.value)}>
                  <option value="">Choose a product</option>
                  {draft.products.filter((product) => !(product.slug in draft.watch.clips)).map((product) => (
                    <option key={product.slug} value={product.slug}>{product.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                disabled={!clipSlug}
                onClick={() => {
                  const slug = clipSlug
                  setClipSlug('')
                  patch((current) => ({
                    ...current,
                    watch: { ...current.watch, clips: { ...current.watch.clips, [slug]: current.watch.clips[slug] || '' } },
                  }))
                }}
              >
                Add video
              </button>
            </div>
          )}
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
                <ImageField id={`review-image-${index}`} label="Image" folder="reviews" value={item.image} onChange={(value) => patch((current) => ({ ...current, reviews: { ...current.reviews, items: current.reviews.items.map((review, i) => i === index ? { ...review, image: value } : review) } }))} />
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
          <ImageField id="about-image" label="About photo" folder="about" value={draft.about.image} onChange={(value) => patch((current) => ({ ...current, about: { ...current.about, image: value } }))} />
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

      {section === 'products' && (
        <>
        <p className="text-sm text-ink-soft">
          Upload a picture to replace the one visitors see. Remove it to show the catalog photo again. <Link to="/admin/products">Edit or archive a product</Link>
        </p>
        {draft.products.map((product, index) => (
        <section key={product.slug}>
          <h3 className="font-medium mb-3">{product.name}</h3>
          <Field id={`${product.slug}-name`} label="Name" value={product.name} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, name: value } : item) }))} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id={`${product.slug}-price`} label="Price" value={product.price} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, price: value } : item) }))} />
            <Field id={`${product.slug}-compare`} label="Compare-at price" value={product.compareAt} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, compareAt: value } : item) }))} />
          </div>
          <Field id={`${product.slug}-tagline`} label="Tagline" value={product.tagline} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, tagline: value } : item) }))} />
          <Field id={`${product.slug}-description`} label="Description" value={product.description} rows="5" onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, description: value } : item) }))} />
          <ImageField id={`${product.slug}-image`} label="Product picture" folder="products" value={product.image} onChange={(value) => patch((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, image: value } : item) }))} />
        </section>
        ))}
        </>
      )}

      <button type="submit" className="btn-lavender w-auto px-8" disabled={saving}>
        {saving ? 'Saving' : 'Save storefront'}
      </button>
    </form>
  )
}
