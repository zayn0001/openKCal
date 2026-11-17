import Icon from '../components/Icon'
import { fmtWeight, weightFromKg, weightToKg } from '../lib/units'
import { today, useSettings, useStore } from '../store'

// ponytail: points are evenly spaced by entry, not by date; switch to a time
// scale if gaps between weigh-ins start to mislead.
function Chart({ points, goal }) {
  if (points.length < 2) return null
  const vals = points.map((p) => p[1]).concat(goal ?? [])
  const min = Math.min(...vals) - 1
  const max = Math.max(...vals) + 1
  const x = (i) => (i / (points.length - 1)) * 300
  const y = (v) => 120 - ((v - min) / (max - min)) * 120
  return (
    <svg viewBox="0 0 300 120" className="chart" role="img" aria-label="Weight over time">
      {goal != null && <line x1="0" x2="300" y1={y(goal)} y2={y(goal)} className="goal" />}
      <polyline points={points.map((p, i) => `${x(i)},${y(p[1])}`).join(' ')} />
    </svg>
  )
}

export default function Weight() {
  const weights = useStore((s) => s.weights)
  const goal = useStore((s) => s.profile?.goalWeightKg)
  const { setWeight, removeWeight } = useStore.getState()
  const unit = useSettings().units.weight
  // Charted in the display unit, stored in kg.
  const points = Object.entries(weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, kg]) => [d, weightFromKg(kg, unit)])

  return (
    <>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          const v = Object.fromEntries(new FormData(e.target))
          setWeight(v.date, Math.round(weightToKg(+v.weight, unit) * 100) / 100)
          e.target.weight.value = ''
        }}
      >
        <div className="card-head">
          <div className="card-head-main">
            <span className="card-head-g icon-tint-sky">
              <Icon name="scale" />
            </span>
            <div className="card-head-t">
              <span className="card-head-title">Log Body Weight</span>
              <span className="card-head-sub">Track daily weigh-ins and progress</span>
            </div>
          </div>
        </div>
        <div className="fields">
          <label>
            Date
            <input name="date" type="date" defaultValue={today()} max={today()} required />
          </label>
          <label>
            Weight ({unit})
            <input name="weight" type="number" min={unit === 'lb' ? 44 : 20} max={unit === 'lb' ? 880 : 400} step="0.1" placeholder={`e.g. ${unit === 'lb' ? '154.5' : '70.2'}`} required />
          </label>
        </div>
        <button className="btn primary" style={{ width: '100%' }}>Save Weigh-in</button>
      </form>

      <section className="card">
        <div className="card-head">
          <div className="card-head-main">
            <span className="card-head-g font-acc">
              <Icon name="chart" />
            </span>
            <div className="card-head-t">
              <span className="card-head-title">Weight Trend</span>
              <span className="card-head-sub">
                {points.length > 0 ? `Latest: ${points[points.length - 1][1]} ${unit}` : 'No data yet'}
              </span>
            </div>
          </div>
        </div>
        <Chart points={points} goal={goal != null ? weightFromKg(goal, unit) : null} />
        {goal != null && (
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 12px' }}>
            <span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--orange)' }} /> Goal target: {fmtWeight(goal, unit)}
          </p>
        )}
        <ul className="list">
          {points
            .slice(-10)
            .reverse()
            .map(([d]) => (
              <li key={d} className="row">
                <span style={{ fontWeight: 500 }}>{d}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <strong style={{ fontSize: 'var(--fs-body)', color: 'var(--label)' }}>
                    {fmtWeight(weights[d], unit)}
                  </strong>
                  <button type="button" className="ghost" onClick={() => removeWeight(d)} aria-label={`Delete the weigh-in on ${d}`} style={{ minHeight: 28, padding: '4px 8px', borderRadius: '50%' }}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          {!points.length && <li className="muted">No weigh-ins yet. Log your first weight above.</li>}
        </ul>
      </section>
    </>
  )
}
