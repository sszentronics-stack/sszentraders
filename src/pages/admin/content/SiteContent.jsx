import { useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../../../lib/supabase/client'
import { loadSiteContent, saveSiteContent } from '../../../lib/siteContent'

export default function SiteContent() {
  const [draft, setDraft] = useState(null)
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

  function updateAnnouncement(index, value) {
    setDraft((current) => {
      const announcements = [...current.announcements]
      announcements[index] = value
      return { ...current, announcements }
    })
  }

  function updateSlide(index, field, value) {
    setDraft((current) => {
      const slides = current.slides.map((slide, slideIndex) => (
        slideIndex === index ? { ...slide, [field]: value } : slide
      ))
      return { ...current, slides }
    })
  }

  function updateAction(slideIndex, actionIndex, field, value) {
    setDraft((current) => {
      const slides = current.slides.map((slide, index) => {
        if (index !== slideIndex) return slide
        const actions = slide.actions.map((action, i) => (
          i === actionIndex ? { ...action, [field]: value } : action
        ))
        return { ...slide, actions }
      })
      return { ...current, slides }
    })
  }

  function updateStory(field, value) {
    setDraft((current) => ({ ...current, story: { ...current.story, [field]: value } }))
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
          Edit the announcement, the homepage banner, and the story beside the product photo.
          The shop stays a static site. {isSupabaseConfigured()
            ? 'Supabase is connected, so a save is stored for every visitor.'
            : 'Supabase is not connected yet, so a save stays in this browser until the project URL and anon key are set.'}
        </p>
      </div>
      {error && <div className="form-banner form-banner-error">{error}</div>}
      {notice && <div className="form-banner form-banner-success">{notice}</div>}

      <section>
        <h3 className="font-medium mb-3">Announcement</h3>
        {draft.announcements.map((message, index) => (
          <div className="form-field" key={index}>
            <label className="form-label" htmlFor={`announce-${index}`}>Message {index + 1}</label>
            <input id={`announce-${index}`} className="form-input" value={message} onChange={(event) => updateAnnouncement(index, event.target.value)} />
          </div>
        ))}
      </section>

      {draft.slides.map((slide, index) => (
        <section key={index}>
          <h3 className="font-medium mb-3">Banner {index + 1}</h3>
          <div className="form-field">
            <label className="form-label" htmlFor={`slide-image-${index}`}>Image address</label>
            <input id={`slide-image-${index}`} className="form-input" value={slide.image} onChange={(event) => updateSlide(index, 'image', event.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`slide-heading-${index}`}>Heading</label>
            <input id={`slide-heading-${index}`} className="form-input" value={slide.heading} onChange={(event) => updateSlide(index, 'heading', event.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor={`slide-text-${index}`}>Text</label>
            <textarea id={`slide-text-${index}`} className="form-input" rows="3" value={slide.text} onChange={(event) => updateSlide(index, 'text', event.target.value)} />
          </div>
          {slide.actions.map((action, actionIndex) => (
            <div className="grid sm:grid-cols-2 gap-4" key={actionIndex}>
              <div className="form-field">
                <label className="form-label" htmlFor={`slide-${index}-label-${actionIndex}`}>Button label</label>
                <input id={`slide-${index}-label-${actionIndex}`} className="form-input" value={action.label} onChange={(event) => updateAction(index, actionIndex, 'label', event.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor={`slide-${index}-to-${actionIndex}`}>Button link</label>
                <input id={`slide-${index}-to-${actionIndex}`} className="form-input" value={action.to} onChange={(event) => updateAction(index, actionIndex, 'to', event.target.value)} />
              </div>
            </div>
          ))}
        </section>
      ))}

      <section>
        <h3 className="font-medium mb-3">Story</h3>
        <div className="form-field">
          <label className="form-label" htmlFor="story-image">Image address</label>
          <input id="story-image" className="form-input" value={draft.story.image} onChange={(event) => updateStory('image', event.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="story-alt">Image description</label>
          <input id="story-alt" className="form-input" value={draft.story.alt} onChange={(event) => updateStory('alt', event.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="story-heading">Heading</label>
          <input id="story-heading" className="form-input" value={draft.story.heading} onChange={(event) => updateStory('heading', event.target.value)} />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="story-text">Text</label>
          <textarea id="story-text" className="form-input" rows="4" value={draft.story.text} onChange={(event) => updateStory('text', event.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="form-field">
            <label className="form-label" htmlFor="story-link-label">Link label</label>
            <input id="story-link-label" className="form-input" value={draft.story.linkLabel} onChange={(event) => updateStory('linkLabel', event.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="story-link">Link</label>
            <input id="story-link" className="form-input" value={draft.story.linkTo} onChange={(event) => updateStory('linkTo', event.target.value)} />
          </div>
        </div>
      </section>

      <button type="submit" className="btn-lavender w-auto px-8" disabled={saving}>
        {saving ? 'Saving' : 'Save storefront'}
      </button>
    </form>
  )
}
