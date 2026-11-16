import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import Dialog from './Dialog'
import { buildDish } from './lib/dish'
import { scale } from './lib/nutrition'
import { MEALS } from './lib/settings'
import { energy } from './lib/units'
import Nutrition from './Nutrition'
import { useSettings, useStore } from './store'

// The browser's own dictation, where it has one (Chrome, Edge, Safari). Chrome sends the audio to
// Google to turn it into text; a phone keyboard's microphone works in the text box too.
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition

function useDictation(onText) {
  const rec = useRef(null)
  const [listening, setListening] = useState(false)
  useEffect(() => () => rec.current?.abort(), [])
  const start = () => {
    const r = new Recognition()
    r.lang = navigator.language || 'en-IN'
    r.continuous = true
    r.interimResults = false
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim())
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }
  const stop = () => rec.current?.stop()
  return { supported: !!Recognition, listening, start, stop }
}

/**
 * "I had two rotis, a bowl of dal and some rice": the AI (on the person's own provider) finds the
 * foods, and may propose new dishes for their list. Everything is shown for review; nothing is
 * logged or saved until they confirm.
 */
export default function DescribeMeal({ date, meal, onClose }) {
  const { units } = useSettings()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null) // { entries, dishes, message, dropped } with on/grams/meal per item
  const [openItem, setOpenItem] = useState(null) // index whose nutrition is showing
  const dictation = useDictation((t) => setText((prev) => (prev ? `${prev} ${t}` : t)))
  const kcal = (v) => `${Math.round(energy(v, units.energy))} ${units.energy}`

  const ask = async (e) => {
    e?.preventDefault()
    dictation.stop()
    setBusy(true)
    setError('')
    const time = new Date().toTimeString().slice(0, 5)
    const r = await api('POST', '/api/ai/describe', { text, time, meal }).catch(() => null)
    setBusy(false)
    if (!r?.ok) return setError(r?.body?.error || 'Could not reach the server')
    setPlan({
      ...r.body,
      entries: r.body.entries.map((x) => ({ ...x, on: true })),
      dishes: r.body.dishes.map((d) => ({ ...d, on: true })),
    })
  }

  const editEntry = (i, patch) => setPlan({ ...plan, entries: plan.entries.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const editDish = (id, patch) => setPlan({ ...plan, dishes: plan.dishes.map((d) => (d.tempId === id ? { ...d, ...patch } : d)) })

  const confirm = () => {
    const { addFood, addEntry } = useStore.getState()
    const saved = {}
    for (const d of plan.dishes) if (d.on) saved[d.tempId] = addFood(buildDish({ name: d.name, ingredients: d.ingredients, servings: 1 }))
    for (const e of plan.entries) {
      if (!e.on || !(e.grams > 0)) continue
      const dish = e.newDish && plan.dishes.find((d) => d.tempId === e.newDish)
      const name = dish ? dish.name : e.food.name
      const foodId = e.newDish ? saved[e.newDish] : e.food.id
      addEntry(date, { meal: e.meal, name, grams: e.grams, ...(foodId && { foodId }), ...scale(e.food.per100, e.grams) })
    }
    onClose()
  }

  const chosen = plan?.entries.filter((e) => e.on && e.grams > 0) || []
  const newDishes = plan?.dishes.filter((d) => d.on) || []

  return (
    <Dialog title="Tell Thally what you ate" onClose={onClose} wide>
      {!plan ? (
        <form onSubmit={ask}>
          <label>
            In your own words
            <textarea
              rows="3"
              maxLength="1000"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Two rotis, a katori of dal and some bhindi for lunch, and a chai"
              required
            />
          </label>
          {dictation.supported && (
            <div className="actions start">
              <button type="button" className={dictation.listening ? 'danger' : 'ghost'} onClick={dictation.listening ? dictation.stop : dictation.start}>
                {dictation.listening ? '■ Stop' : '🎤 Speak'}
              </button>
              {dictation.listening && <span className="muted">Listening… say what you ate.</span>}
            </div>
          )}
          <p className="muted">
            Sent to your own AI provider with the names of your foods and dishes. It finds each food and may suggest new dishes for your list; you check
            everything before anything is saved.
            {dictation.supported && ' Speaking uses your browser’s speech recognition, which in Chrome sends the audio to Google.'}
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button disabled={busy || text.trim().length < 2}>{busy ? 'Working it out…' : 'Work it out'}</button>
          </div>
        </form>
      ) : (
        <>
          {plan.message && <p className="note">{plan.message}</p>}
          {plan.dropped > 0 && <p className="muted">{plan.dropped} suggested item(s) didn’t match a real food and were left out.</p>}
          {!plan.entries.length && <p className="muted">Nothing to log yet. Add more detail and try again.</p>}

          {plan.entries.length > 0 && (
            <>
              <h3>To log on {date}</h3>
              <ul className="list">
                {plan.entries.map((e, i) => {
                  const dish = e.newDish && plan.dishes.find((d) => d.tempId === e.newDish)
                  return (
                    <li key={i}>
                      <div className="row">
                        <input type="checkbox" checked={e.on} onChange={(ev) => editEntry(i, { on: ev.target.checked })} aria-label={`Log ${e.food.name}`} style={{ width: 'auto' }} />
                        <button type="button" className="row inline" onClick={() => setOpenItem(openItem === i ? null : i)}>
                          <span>
                            {dish ? dish.name : e.food.name}
                            {dish && <span className="tag dish">new dish</span>}
                          </span>
                        </button>
                        <input type="number" min="1" max="3000" step="any" className="grams" value={e.grams} onChange={(ev) => editEntry(i, { grams: +ev.target.value })} aria-label="Grams" />
                        <small>g</small>
                        <select value={e.meal} onChange={(ev) => editEntry(i, { meal: ev.target.value })} aria-label="Meal" className="meal">
                          {MEALS.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <small className="muted indent">
                        {kcal(scale(e.food.per100, e.grams || 0).kcal)} · tap the name for full nutrition
                      </small>
                      {openItem === i && <Nutrition per100={e.food.per100} grams={e.grams || 0} />}
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {plan.dishes.length > 0 && (
            <>
              <h3>New dishes for My dishes</h3>
              <p className="muted">These aren’t in your list yet. Tick the ones to save, so you can find them next time.</p>
              {plan.dishes.map((d) => (
                <div key={d.tempId} className="dish-draft">
                  <label className="inline">
                    <input type="checkbox" checked={d.on} onChange={(ev) => editDish(d.tempId, { on: ev.target.checked })} />
                    <input value={d.name} onChange={(ev) => editDish(d.tempId, { name: ev.target.value })} aria-label="Dish name" maxLength="80" />
                  </label>
                  <small className="muted">
                    One serving: {d.ingredients.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(', ')} · {kcal(scale(d.per100, d.grams).kcal)}
                  </small>
                </div>
              ))}
            </>
          )}

          <div className="actions">
            <button type="button" className="ghost" onClick={() => setPlan(null)}>
              Change description
            </button>
            <button type="button" disabled={!chosen.length && !newDishes.length} onClick={confirm}>
              {chosen.length ? `Log ${chosen.length} item${chosen.length === 1 ? '' : 's'}` : 'Save'}
              {newDishes.length ? ` and save ${newDishes.length} dish${newDishes.length === 1 ? '' : 'es'}` : ''}
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
