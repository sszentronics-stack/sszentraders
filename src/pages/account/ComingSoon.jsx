export default function ComingSoon({ title, description }) {
  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-medium font-display mb-3">{title}</h2>
      <p className="text-ink-soft max-w-md mx-auto">{description}</p>
      <p className="label-wide mt-6" style={{ color: '#c5998e' }}>
        Coming soon
      </p>
    </div>
  )
}
