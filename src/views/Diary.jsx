import { useState } from 'react'
import Dialog from '../Dialog'
import DishBuilder from '../DishBuilder'
import FoodPicker from '../FoodPicker'
import { per100Of, scale, sum } from '../lib/nutrition'
import { MEALS } from '../lib/settings'
import { targets } from '../lib/targets'
import { energy } from '../lib/units'
import { shiftDate, weekSummary } from '../lib/week'
import Nutrition from '../Nutrition'
import PhotoLog from '../PhotoLog'
import { latestWeight, today, useSettings, useStore } from '../store'
import { api, useSync } from '../sync'

const MACROS = [
  ['protein', 'Protein'],
  ['carbs', 'Carbs'],
  ['fat', 'Fat'],
  ['fibre', 'Fibre'],
]

// Weekly AI review of the seven days ending on `date`, on the person's own AI provider.
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
      {text && <p className="muted">AI-generated from your last 7 days, on your own AI provider. Not medical advice.</p>}
    </section>
  )
}

// One logged entry: its nutrition, and changing the amount, the meal, or deleting it.
function EntryDetail({ date, entry, onClose }) {
  const [grams, setGrams] = useState(Math.round(entry.grams * 10) / 10)
  const [meal, setMeal] = useState(entry.meal)
  const per100 = per100Of(entry)
  const { updateEntry, removeEntry } = useStore.getState()
  return (
    <Dialog title={entry.name} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          updateEntry(date, entry.id, { meal, grams, ...scale(per100, grams) })
          onClose()
        }}
      >
        <div className="fields">
          <label>
            Grams
            <input type="number" min="0.1" step="any" required value={grams} onChange={(e) => setGrams(+e.target.value)} />
          </label>
          <label>
            Meal
            <select value={meal} onChange={(e) => setMeal(e.target.value)}>
              {MEALS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <Nutrition per100={per100} grams={grams || 0} />
        <div className="actions">
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              removeEntry(date, entry.id)
              onClose()
            }}
          >
            Delete
          </button>
          <button disabled={grams === Math.round(entry.grams * 10) / 10 && meal === entry.meal}>Save</button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Diary({ goSettings }) {
  const [date, setDate] = useState(today)
  const [addTo, setAddTo] = useState(null) // meal the picker is open for
  const [photoTo, setPhotoTo] = useState(null) // meal the photo dialog is open for
  const [open, setOpen] = useState(null) // entry whose detail is showing
  const [dishFrom, setDishFrom] = useState(null) // meal being saved as a dish
  const { units, modules } = useSettings()
  const user = useSync((s) => s.user)
  const aiReady = modules.ai && !!user?.ai?.ready
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const entries = useStore((s) => s.diary[date]) || []
  const glasses = useStore((s) => s.water[date]) || 0
  const { addEntry, removeEntry, addWater } = useStore.getState()
  const kcal = (v) => Math.round(energy(v, units.energy))

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
          {kcal(eaten.kcal)}
          <small>{goal ? ` / ${kcal(goal.kcal)} ${units.energy}` : ` ${units.energy}`}</small>
        </p>
        {goal ? (
          <>
            <progress value={eaten.kcal} max={goal.kcal} aria-label="Energy against target" />
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
          <button type="button" className="ghost" onClick={goSettings}>
            Set up your profile to get daily targets
          </button>
        )}
        {entries.length > 0 && (
          <details>
            <summary>All nutrients for this day</summary>
            <Nutrition totals={eaten} known={eaten.known} amountLabel="Total" />
          </details>
        )}
      </section>

      {MEALS.map((meal) => {
        const items = entries.filter((e) => e.meal === meal)
        return (
          <section className="card" key={meal}>
            <header>
              <h2>{meal}</h2>
              <small>
                {kcal(sum(items).kcal)} {units.energy}
              </small>
              {aiReady && (
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
                  <button type="button" className="row inline" onClick={() => setOpen(e)}>
                    <span>
                      {e.name} <small>{Math.round(e.grams)} g</small>
                    </span>
                    <small>
                      {kcal(e.kcal)} {units.energy}
                    </small>
                  </button>
                  <button type="button" className="ghost" onClick={() => removeEntry(date, e.id)} aria-label={`Remove ${e.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {items.length > 1 && (
              <div className="actions start">
                <button type="button" className="link" onClick={() => setDishFrom(items)}>
                  Save this {meal.toLowerCase()} as a dish
                </button>
              </div>
            )}
          </section>
        )
      })}

      {modules.water && (
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
      )}

      {aiReady && <Review date={date} goal={goal} />}
      {modules.ai && user && !user.ai?.ready && (
        <p className="muted center">
          Photo logging and the weekly review run on your own AI provider.{' '}
          <button type="button" className="link" onClick={() => goSettings('ai')}>
            Connect one in Settings
          </button>
        </p>
      )}

      {photoTo && (
        <PhotoLog
          title={`Photo for ${photoTo.toLowerCase()}`}
          onClose={() => setPhotoTo(null)}
          onAdd={(items) => {
            for (const it of items) addEntry(date, { meal: photoTo, name: it.name, grams: it.grams, ...scale(it.per100, it.grams) })
            setPhotoTo(null)
          }}
        />
      )}

      {addTo && (
        <FoodPicker
          title={`Add to ${addTo.toLowerCase()}`}
          onClose={() => setAddTo(null)}
          onPick={(food, grams) => {
            addEntry(date, { meal: addTo, name: food.name, grams, foodId: food.id, ...scale(food.per100, grams) })
            setAddTo(null)
          }}
        />
      )}

      {open && <EntryDetail date={date} entry={open} onClose={() => setOpen(null)} />}

      {dishFrom && (
        <DishBuilder
          start={dishFrom.map((e) => ({ name: e.name, grams: e.grams, per100: per100Of(e), ...(e.foodId && { foodId: e.foodId }) }))}
          onClose={() => setDishFrom(null)}
          onSaved={() => setDishFrom(null)}
        />
      )}
    </>
  )
}
