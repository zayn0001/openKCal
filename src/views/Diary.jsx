import { useState } from 'react'
import FoodPicker from '../FoodPicker'
import PhotoLog from '../PhotoLog'
import { scale, sum } from '../lib/nutrition'
import { targets } from '../lib/targets'
import { shiftDate, weekSummary } from '../lib/week'
import { latestWeight, today, useStore } from '../store'
import { api, useSync } from '../sync'

const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner']
const MACROS = [
  ['protein', 'Protein'],
  ['carbs', 'Carbs'],
  ['fat', 'Fat'],
  ['fibre', 'Fibre'],
]

// Weekly AI review of the seven days ending on `date`.
function Review({ date, goal }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const summary = weekSummary(useStore.getState(), goal, date)
    const r = await api('POST', '/api/ai/review', { summary }).catch(() => null)
    setText(r?.ok ? r.body.text : r?.body?.error || 'Could not get a review. Try again.')
    setBusy(false)
  }
  return (
    <section className="card">
      <header>
        <h2>Weekly review</h2>
        <button type="button" className="ghost" onClick={run} disabled={busy}>
          {busy ? 'Thinking…' : 'Review my week'}
        </button>
      </header>
      {text && <pre className="review">{text}</pre>}
      {text && <p className="muted">AI-generated from your last 7 days. Not medical advice.</p>}
    </section>
  )
}

export default function Diary({ goProfile }) {
  const [date, setDate] = useState(today)
  const [addTo, setAddTo] = useState(null) // meal the picker is open for
  const [photoTo, setPhotoTo] = useState(null) // meal the photo dialog is open for
  const ai = useSync((s) => !!s.user && !!s.server?.ai)
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const entries = useStore((s) => s.diary[date]) || []
  const glasses = useStore((s) => s.water[date]) || 0
  const { addEntry, removeEntry, addWater } = useStore.getState()

  const eaten = sum(entries)
  const goal = profile && targets({ ...profile, weightKg: latestWeight(weights) ?? profile.weightKg })

  return (
    <>
      <nav className="datebar">
        <button type="button" className="ghost" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
        <button type="button" className="ghost" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          ›
        </button>
      </nav>

      <section className="card">
        <p className="big">
          {Math.round(eaten.kcal)}
          <small>{goal ? ` / ${goal.kcal} kcal` : ' kcal'}</small>
        </p>
        {goal ? (
          <>
            <progress value={eaten.kcal} max={goal.kcal} />
            <div className="macros">
              {MACROS.map(([k, label]) => (
                <label key={k}>
                  {label}
                  <progress value={eaten[k]} max={goal[k]} />
                  <small>
                    {Math.round(eaten[k])} / {goal[k]} g
                  </small>
                </label>
              ))}
            </div>
          </>
        ) : (
          <button type="button" className="ghost" onClick={goProfile}>
            Set up your profile to get daily targets
          </button>
        )}
      </section>

      {MEALS.map((meal) => {
        const items = entries.filter((e) => e.meal === meal)
        return (
          <section className="card" key={meal}>
            <header>
              <h2>{meal}</h2>
              <small>{Math.round(sum(items).kcal)} kcal</small>
              {ai && (
                <button type="button" className="ghost" onClick={() => setPhotoTo(meal)}>
                  Photo
                </button>
              )}
              <button type="button" onClick={() => setAddTo(meal)}>
                + Add
              </button>
            </header>
            <ul className="list">
              {items.map((e) => (
                <li key={e.id} className="row">
                  <span>
                    {e.name} <small>{Math.round(e.grams)} g</small>
                  </span>
                  <small>{Math.round(e.kcal)} kcal</small>
                  <button type="button" className="ghost" onClick={() => removeEntry(date, e.id)} aria-label={`Remove ${e.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <section className="card">
        <header>
          <h2>Water</h2>
          <small>
            {glasses} {glasses === 1 ? 'glass' : 'glasses'}
          </small>
          <button type="button" className="ghost" onClick={() => addWater(date, -1)} aria-label="Remove a glass">
            −
          </button>
          <button type="button" onClick={() => addWater(date, 1)} aria-label="Add a glass">
            +
          </button>
        </header>
      </section>

      {ai && <Review date={date} goal={goal} />}

      {photoTo && (
        <PhotoLog
          title={`Photo for ${photoTo.toLowerCase()}`}
          onClose={() => setPhotoTo(null)}
          onAdd={(items) => {
            for (const it of items)
              addEntry(date, { meal: photoTo, name: it.name, grams: it.grams, ...scale(it.per100, it.grams) })
            setPhotoTo(null)
          }}
        />
      )}

      {addTo && (
        <FoodPicker
          title={`Add to ${addTo.toLowerCase()}`}
          onClose={() => setAddTo(null)}
          onPick={(food, grams) => {
            addEntry(date, { meal: addTo, name: food.name, grams, ...scale(food.per100, grams) })
            setAddTo(null)
          }}
        />
      )}
    </>
  )
}
