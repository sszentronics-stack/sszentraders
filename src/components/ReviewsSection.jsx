import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase/client'
import {
  computeAggregateRating,
  createReview,
  listPublishedReviews,
  listReviewableOrderItems,
  reviewImagePublicUrl,
  uploadReviewImage,
} from '../repositories/reviews.repository'

function StarRow({ rating, size = 14 }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} fill={i < Math.round(rating) ? '#102b26' : 'none'} color="#102b26" />
      ))}
    </span>
  )
}

function RatingInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star size={22} fill={n <= value ? '#102b26' : 'none'} color="#102b26" />
        </button>
      ))}
    </div>
  )
}

function WriteReviewForm({ target, onDone }) {
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (rating < 1) {
      setError('Please select a star rating.')
      return
    }
    setSubmitting(true)
    try {
      const review = await createReview({ orderItemId: target.orderItemId, rating, title: title || undefined, body: body || undefined })
      if (file) {
        await uploadReviewImage(review.id, file)
      }
      onDone()
    } catch (err) {
      setError(err?.message ?? 'Could not submit your review.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="address-card mb-6">
      <p className="font-medium mb-3">Review your purchase: {target.productName}</p>
      {error && <div className="form-banner form-banner-error mb-3">{error}</div>}
      <div className="form-field">
        <label className="form-label">Your rating</label>
        <RatingInput value={rating} onChange={setRating} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="review-title">
          Title (optional)
        </label>
        <input id="review-title" className="form-input" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="review-body">
          Your review (optional)
        </label>
        <textarea
          id="review-body"
          className="form-input"
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="review-image">
          Add a photo (optional)
        </label>
        <input id="review-image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <button type="submit" className="btn-lavender" style={{ width: 'auto' }} disabled={submitting}>
        {submitting ? <span className="spinner" /> : 'Submit review'}
      </button>
      <p className="text-xs text-ink-soft mt-2">Reviews are checked before they appear publicly.</p>
    </form>
  )
}

export default function ReviewsSection({ productId }) {
  const { isAuthenticated } = useAuth()
  const [reviews, setReviews] = useState(null)
  const [error, setError] = useState('')
  const [reviewableTarget, setReviewableTarget] = useState(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured() || !productId) return
    listPublishedReviews(productId)
      .then(setReviews)
      .catch((err) => setError(err?.message ?? 'Could not load reviews.'))
  }, [productId])

  useEffect(() => {
    if (!isSupabaseConfigured() || !isAuthenticated || !productId || justSubmitted) return
    listReviewableOrderItems()
      .then((items) => setReviewableTarget(items.find((item) => item.productId === productId) ?? null))
      .catch(() => setReviewableTarget(null))
  }, [isAuthenticated, productId, justSubmitted])

  if (!isSupabaseConfigured()) return null

  const aggregate = computeAggregateRating(reviews ?? [])

  return (
    <section className="mt-16 max-w-3xl">
      <h2 className="text-2xl font-medium mb-6">Customer reviews</h2>

      {reviews && reviews.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          <StarRow rating={aggregate.average} size={16} />
          <span className="font-medium">{aggregate.average}</span>
          <span className="text-ink-soft text-sm">({aggregate.count} review{aggregate.count === 1 ? '' : 's'})</span>
        </div>
      )}

      {reviewableTarget && !justSubmitted && (
        <WriteReviewForm target={reviewableTarget} onDone={() => setJustSubmitted(true)} />
      )}
      {justSubmitted && <div className="form-banner mb-6">Thanks! Your review is awaiting moderation and will appear here once approved.</div>}

      {error && <p className="text-ink-soft">{error}</p>}
      {reviews === null && !error && <p className="text-ink-soft">Loading reviews...</p>}
      {reviews && reviews.length === 0 && <p className="text-ink-soft">No reviews yet — be the first to share your experience.</p>}

      {reviews && reviews.length > 0 && (
        <div className="space-y-6">
          {reviews.map((review) => (
            <div key={review.id} className="border-b border-[#eee] pb-6">
              <div className="flex items-center gap-2 mb-1">
                <StarRow rating={review.rating} />
                {review.title && <span className="font-medium">{review.title}</span>}
              </div>
              {review.body && <p className="text-sm text-ink-soft mb-2 whitespace-pre-line">{review.body}</p>}
              {review.images.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {review.images.map((img) => (
                    <img
                      key={img.id}
                      src={reviewImagePublicUrl(img.storagePath)}
                      alt=""
                      className="w-16 h-16 object-cover border border-line"
                    />
                  ))}
                </div>
              )}
              <p className="text-xs text-ink-soft mt-2">{new Date(review.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
