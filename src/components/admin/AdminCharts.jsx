/**
 * Lightweight SVG charts for the admin dashboard — solid theme colors only.
 */

export const DASHBOARD_COLORS = {
  rose: '#c98a7d',
  roseSoft: '#e5b6a8',
  roseLine: '#c5998e',
  roseDeep: '#b3776b',
  blush: '#fceee9',
  blushDeep: '#f4e7e2',
  ink: '#222222',
  inkSoft: '#7a5b53',
  inkMuted: '#5c4540',
  soft: '#eddad3',
  warn: '#a15b1f',
  bad: '#c31818',
  good: '#2f6b45',
  track: '#f4e7e2',
  white: '#ffffff',
}

export const QUEUE_COLORS = {
  orders: DASHBOARD_COLORS.rose,
  payments: DASHBOARD_COLORS.warn,
  shipments: DASHBOARD_COLORS.inkSoft,
  returns: DASHBOARD_COLORS.roseDeep,
  erp: DASHBOARD_COLORS.bad,
}

export function AreaTrendChart({ points, color = DASHBOARD_COLORS.rose, height = 180 }) {
  if (!points?.length) return null

  const width = 560
  const padX = 12
  const padY = 18
  const max = Math.max(...points.map((p) => p.value), 1)
  const min = Math.min(...points.map((p) => p.value), 0)
  const span = Math.max(max - min, 1)

  const coords = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2)
    const y = height - padY - ((p.value - min) / span) * (height - padY * 2)
    return { x, y, ...p }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const area = `${line} L${coords[coords.length - 1].x},${height - padY} L${coords[0].x},${height - padY} Z`

  return (
    <div className="admin-chart" role="img" aria-label="Trend chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((t) => {
          const y = padY + t * (height - padY * 2)
          return <line key={t} x1={padX} x2={width - padX} y1={y} y2={y} stroke={DASHBOARD_COLORS.soft} strokeWidth="1" />
        })}
        <path d={area} fill={color} fillOpacity="0.18" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((c) => (
          <circle key={c.label} cx={c.x} cy={c.y} r="4" fill={DASHBOARD_COLORS.white} stroke={color} strokeWidth="2" />
        ))}
        {coords.map((c) => (
          <text key={`${c.label}-t`} x={c.x} y={height - 2} textAnchor="middle" fontSize="11" fill={DASHBOARD_COLORS.inkSoft}>
            {c.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function VerticalBarChart({ points, color = DASHBOARD_COLORS.rose, height = 220 }) {
  if (!points?.length) return null

  const width = 640
  const padX = 16
  const padTop = 16
  const padBottom = 28
  const max = Math.max(...points.map((p) => p.value), 1)
  const gap = 8
  const barWidth = (width - padX * 2 - gap * (points.length - 1)) / points.length
  const chartHeight = height - padTop - padBottom

  return (
    <div className="admin-chart" role="img" aria-label="Yearly bar chart">
      <svg viewBox={`0 0 ${width} ${height}`}>
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + chartHeight * (1 - t)
          return <line key={t} x1={padX} x2={width - padX} y1={y} y2={y} stroke={DASHBOARD_COLORS.soft} strokeWidth="1" />
        })}
        {points.map((p, i) => {
          const barH = (p.value / max) * chartHeight
          const x = padX + i * (barWidth + gap)
          const y = padTop + chartHeight - barH
          return (
            <g key={p.label}>
              <rect x={x} y={y} width={barWidth} height={Math.max(barH, 2)} rx="4" fill={color} />
              <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fill={DASHBOARD_COLORS.inkSoft}>
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function DonutChart({ segments, size = 180, thickness = 26 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="admin-chart">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ margin: '0 auto' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={DASHBOARD_COLORS.track} strokeWidth={thickness} />
        {segments.map((seg) => {
          const length = (seg.value / total) * circumference
          const dash = `${length} ${circumference - length}`
          const el = (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += length
          return el
        })}
        <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="600" fill={DASHBOARD_COLORS.ink}>
          {total}
        </text>
        <text x="50%" y="58%" textAnchor="middle" fontSize="12" fill={DASHBOARD_COLORS.inkSoft}>
          open items
        </text>
      </svg>
      <div className="admin-chart-legend">
        {segments.map((seg) => (
          <span key={seg.label} className="admin-chart-legend-item">
            <span className="admin-chart-swatch" style={{ background: seg.color }} />
            {seg.label} ({seg.value})
          </span>
        ))}
      </div>
    </div>
  )
}

export function HorizontalBars({ rows, max: maxProp }) {
  const max = maxProp ?? Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="admin-hbar-list">
      {rows.map((row) => (
        <div key={row.label} className="admin-hbar-row">
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="admin-hbar-meta">
              <span>{row.label}</span>
              <strong>{row.display ?? row.value}</strong>
            </div>
            <div className="admin-hbar-track">
              <div
                className="admin-hbar-fill"
                style={{
                  width: `${Math.max(4, (row.value / max) * 100)}%`,
                  background: row.color || DASHBOARD_COLORS.rose,
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
