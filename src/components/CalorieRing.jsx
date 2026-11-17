export default function CalorieRing({ eaten, goal, burned = 0, units = { energy: 'kcal' } }) {
  const targetKcal = goal ? Math.round(goal.kcal) : 2000
  const eatenKcal = Math.round(eaten.kcal || 0)
  const burnedKcal = Math.round(burned || 0)
  const netKcal = eatenKcal - burnedKcal
  const remaining = targetKcal - eatenKcal + burnedKcal
  const isOver = remaining < 0

  // SVG Gauge calculations
  const size = 160
  const strokeWidth = 12
  const center = size / 2
  const radius = center - strokeWidth
  const circ = 2 * Math.PI * radius
  const pct = Math.min(1.5, Math.max(0, eatenKcal / Math.max(1, targetKcal)))
  const offset = circ - Math.min(1, pct) * circ

  const macros = [
    { key: 'protein', name: 'Protein', color: 'var(--acc)', val: Math.round(eaten.protein || 0), target: goal ? Math.round(goal.protein) : 100 },
    { key: 'carbs', name: 'Carbs', color: 'var(--orange)', val: Math.round(eaten.carbs || 0), target: goal ? Math.round(goal.carbs) : 220 },
    { key: 'fat', name: 'Fat', color: 'var(--pink)', val: Math.round(eaten.fat || 0), target: goal ? Math.round(goal.fat) : 65 },
    { key: 'fibre', name: 'Fiber', color: 'var(--teal)', val: Math.round(eaten.fibre || 0), target: goal?.fibre ? Math.round(goal.fibre) : 30 },
  ]

  return (
    <div className="cal-card card">
      <div className="cal-gauge-row">
        <div className="cal-ring-wrap">
          <svg width={size} height={size} className="cal-ring-svg">
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke="var(--surface-3)"
              strokeWidth={strokeWidth}
              fill="none"
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke={isOver ? 'var(--red)' : 'var(--acc)'}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`}
              className="ring-progress"
            />
          </svg>
          <div className="cal-ring-center">
            <span className="cal-rem-num">{Math.abs(remaining)}</span>
            <span className="cal-rem-lbl">{isOver ? 'Over' : 'Remaining'}</span>
            <span className="cal-rem-unit">{units.energy}</span>
          </div>
        </div>

        <div className="cal-stats-col">
          <div className="cal-stat-item">
            <span className="cal-stat-lbl">Base Goal</span>
            <span className="cal-stat-val">{targetKcal}</span>
          </div>
          <div className="cal-stat-item">
            <span className="cal-stat-lbl">Food Eaten</span>
            <span className="cal-stat-val font-acc">{eatenKcal}</span>
          </div>
          <div className="cal-stat-item">
            <span className="cal-stat-lbl">Exercise</span>
            <span className="cal-stat-val font-orange">−{burnedKcal}</span>
          </div>
          <div className="cal-stat-sep" />
          <div className="cal-stat-item">
            <span className="cal-stat-lbl">Net Calories</span>
            <span className="cal-stat-val">{netKcal}</span>
          </div>
        </div>
      </div>

      {/* Macro Capsules */}
      <div className="macro-capsules">
        {macros.map((m) => {
          const mPct = Math.min(100, Math.round((m.val / Math.max(1, m.target)) * 100))
          return (
            <div key={m.key} className="macro-capsule">
              <div className="macro-cap-head">
                <span className="macro-cap-name" style={{ color: m.color }}>{m.name}</span>
                <span className="macro-cap-pct">{mPct}%</span>
              </div>
              <div className="macro-bar-bg">
                <div
                  className="macro-bar-fill"
                  style={{ width: `${mPct}%`, backgroundColor: m.color }}
                />
              </div>
              <div className="macro-cap-foot">
                <span>{m.val}g</span>
                <span className="cap-target">/ {m.target}g</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
