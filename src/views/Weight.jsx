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
        <h2>Log weight</h2>
        <div className="fields">
          <label>
            Date
            <input name="date" type="date" defaultValue={today()} max={today()} required />
          </label>
          <label>
            Weight ({unit})
            <input name="weight" type="number" min={unit === 'lb' ? 44 : 20} max={unit === 'lb' ? 880 : 400} step="0.1" required />
          </label>
        </div>
        <button>Save</button>
      </form>

      <section className="card">
        <h2>Trend</h2>
        <Chart points={points} goal={goal != null ? weightFromKg(goal, unit) : null} />
        {goal != null && <p className="muted">Dashed line: goal {fmtWeight(goal, unit)}</p>}
        <ul className="list">
          {points
            .slice(-10)
            .reverse()
            .map(([d]) => (
              <li key={d} className="row">
                <span>{d}</span>
                <small>{fmtWeight(weights[d], unit)}</small>
                <button type="button" className="ghost" onClick={() => removeWeight(d)} aria-label={`Delete the weigh-in on ${d}`}>
                  ✕
                </button>
              </li>
            ))}
          {!points.length && <li className="muted">No weigh-ins yet.</li>}
        </ul>
      </section>
    </>
  )
}
