import { useLayoutEffect, useRef, useState } from 'react'

const W = 340 // viewBox width

export default function LineChart({
  points,
  h = 150,
  unit = '',
  color = 'var(--acc)',
  axes = true,
  goal = null,
  emptyText = 'No data recorded yet',
}) {
  const wrapRef = useRef(null)
  const tipRef = useRef(null)
  const [hover, setHover] = useState(null)

  useLayoutEffect(() => {
    // Layout timing clears hover on new points
  }, [points])

  useLayoutEffect(() => {
    const tip = tipRef.current
    const wrap = wrapRef.current
    if (!hover || !tip || !wrap) return
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const M = 6
    const cx = (hover.x / W) * cw
    const cy = (hover.y / h) * ch
    tip.style.left = `${Math.max(M, Math.min(cw - tw - M, cx - tw / 2))}px`
    tip.style.top = `${cy < th + 14 ? Math.min(ch - th - M, cy + 14) : M}px`
  })

  if (!points || points.length === 0) {
    return <div className="empty-chart">{emptyText}</div>
  }

  const P = { l: axes ? 36 : 8, r: 12, t: 12, b: axes ? 24 : 8 }
  const single = points.length === 1
  const pts = single ? [{ ...points[0], x: 0 }, { ...points[0], x: 1 }] : points

  // Axis fits the data only; the goal line is drawn when it falls inside that range.
  const ys = pts.map((p) => p.y)
  let ymin = Math.min(...ys)
  let ymax = Math.max(...ys)
  if (ymin === ymax) {
    ymin -= 1
    ymax += 1
  }
  const showGoal = goal != null && isFinite(goal) && goal >= ymin && goal <= ymax
  const fmt = (v) => (ymax - ymin < 10 ? v.toFixed(1) : Math.round(v))

  const X = (i) => P.l + (i / Math.max(1, pts.length - 1)) * (W - P.l - P.r)
  const Y = (y) => P.t + (1 - (y - ymin) / (ymax - ymin)) * (h - P.t - P.b)

  const coords = pts.map((p, i) => ({
    x: X(i),
    y: Y(p.y),
    label: p.label || p.d,
    val: p.y,
  }))

  const pathD = coords.reduce((acc, c, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`, '')

  return (
    <div className="chart-wrap" ref={wrapRef} onPointerLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${h}`}
        className="og-chart"
        role="img"
        aria-label="Progress chart"
        onPointerMove={(e) => {
          const wrap = wrapRef.current
          if (!wrap) return
          const rect = wrap.getBoundingClientRect()
          const mx = ((e.clientX - rect.left) / rect.width) * W
          let closest = coords[0]
          let minDist = Infinity
          for (const c of coords) {
            const d = Math.abs(c.x - mx)
            if (d < minDist) {
              minDist = d
              closest = c
            }
          }
          if (closest) setHover(closest)
        }}
      >
        {/* Gridlines */}
        {axes && (
          <g className="chart-axes">
            <line x1={P.l} y1={P.t} x2={W - P.r} y2={P.t} className="gridline" />
            <line x1={P.l} y1={P.t + (h - P.t - P.b) / 2} x2={W - P.r} y2={P.t + (h - P.t - P.b) / 2} className="gridline" />
            <line x1={P.l} y1={h - P.b} x2={W - P.r} y2={h - P.b} className="gridline" />
            <text x={P.l - 4} y={P.t + 4} textAnchor="end" className="axis-lbl">
              {fmt(ymax)}
            </text>
            <text x={P.l - 4} y={P.t + (h - P.t - P.b) / 2 + 4} textAnchor="end" className="axis-lbl">
              {fmt((ymax + ymin) / 2)}
            </text>
            <text x={P.l - 4} y={h - P.b + 4} textAnchor="end" className="axis-lbl">
              {fmt(ymin)}
            </text>
          </g>
        )}

        {/* Goal line */}
        {showGoal && (
          <line
            x1={P.l}
            x2={W - P.r}
            y1={Y(goal)}
            y2={Y(goal)}
            className="chart-goal-line"
            strokeDasharray="4 4"
          />
        )}

        {/* Main curve */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {coords.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={hover?.x === c.x ? 5 : 3}
            fill={hover?.x === c.x ? 'var(--label)' : color}
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {hover && (
        <div className="chart-tip" ref={tipRef}>
          <strong>
            {hover.val} {unit}
          </strong>
          {hover.label && <small>{hover.label}</small>}
        </div>
      )}
    </div>
  )
}
