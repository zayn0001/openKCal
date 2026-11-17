import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import Dialog from './Dialog'
import Icon from './components/Icon'
import { buildDish } from './lib/dish'
import { scale } from './lib/nutrition'
import { MEALS } from './lib/settings'
import { energy } from './lib/units'
import { useSettings, useStore } from './store'
import { useUI } from './store/useUI'

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
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim())
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

export default function DescribeMeal({ date, meal, onClose }) {
  const { units } = useSettings()
  const { toast } = useUI.getState()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
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

  const editEntry = (i, patch) =>
    setPlan({ ...plan, entries: plan.entries.map((x, j) => (j === i ? { ...x, ...patch } : x)) })

  const confirm = () => {
    const { addFood, addEntry } = useStore.getState()
    const saved = {}
    for (const d of plan.dishes)
      if (d.on) saved[d.tempId] = addFood(buildDish({ name: d.name, ingredients: d.ingredients, servings: 1 }))
    for (const e of plan.entries) {
      if (!e.on || !(e.grams > 0)) continue
      const dish = e.newDish && plan.dishes.find((d) => d.tempId === e.newDish)
      const name = dish ? dish.name : e.food.name
      const foodId = e.newDish ? saved[e.newDish] : e.food.id
      addEntry(date, {
        meal: e.meal,
        name,
        grams: e.grams,
        ...(foodId && { foodId }),
        ...scale(e.food.per100, e.grams),
      })
    }
    toast('Logged AI meal items')
    onClose()
  }

  const chosen = plan?.entries.filter((e) => e.on && e.grams > 0) || []
  const newDishes = plan?.dishes.filter((d) => d.on) || []

  return (
    <Dialog title="Describe Meal to AI" onClose={onClose} wide>
      {!plan ? (
        <form onSubmit={ask}>
          <div style={{ marginBottom: 12 }}>
            <textarea
              rows="3"
              maxLength="1000"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Grilled chicken breast, sweet potato, avocado, and steamed broccoli for lunch"
              required
              className="field area"
            />
          </div>

          {dictation.supported && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <button
                type="button"
                className={'btn sm ' + (dictation.listening ? 'danger' : 'tinted')}
                onClick={dictation.listening ? dictation.stop : dictation.start}
              >
                <Icon name={dictation.listening ? 'pause' : 'chat'} />
                {dictation.listening ? 'Stop Speaking' : 'Speak Meal'}
              </button>
              {dictation.listening && <span className="muted">Listening… say what you ate.</span>}
            </div>
          )}

          <p className="muted" style={{ margin: '0 0 14px' }}>
            AI parses your description, matches your foods and recipe dishes, and estimates portion grams. You review everything before anything is logged.
          </p>

          {error && <p style={{ color: 'var(--red)', margin: '0 0 10px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || text.trim().length < 2}
              style={{ flex: 2 }}
            >
              {busy ? 'Analyzing meal…' : 'Parse with AI'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {plan.message && <p className="muted" style={{ margin: '0 0 12px' }}>{plan.message}</p>}
          {plan.dropped > 0 && (
            <p className="muted">{plan.dropped} item(s) didn’t match a real food and were excluded.</p>
          )}

          {plan.entries.length > 0 && (
            <div className="sect-b" style={{ marginBottom: 14 }}>
              {plan.entries.map((e, i) => {
                const dish = e.newDish && plan.dishes.find((d) => d.tempId === e.newDish)
                return (
                  <div key={i} className="lrow">
                    <input
                      type="checkbox"
                      checked={e.on}
                      onChange={(ev) => editEntry(i, { on: ev.target.checked })}
                      aria-label={`Log ${e.food.name}`}
                      className="chk on"
                      style={{ width: 'auto', marginRight: 6 }}
                    />
                    <div
                      className="lrow-m"
                      style={{ textAlign: 'start' }}
                    >
                      <span className="lrow-t">
                        {dish ? dish.name : e.food.name}
                        {dish && <span className="tag dish">new dish</span>}
                      </span>
                      <span className="lrow-s">
                        {kcal(scale(e.food.per100, e.grams || 0).kcal)}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="3000"
                      step="any"
                      className="num"
                      value={e.grams}
                      onChange={(ev) => editEntry(i, { grams: +ev.target.value })}
                      style={{ width: '60px', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--label-2)' }}>g</span>
                    <select
                      value={e.meal}
                      onChange={(ev) => editEntry(i, { meal: ev.target.value })}
                      className="activity-select"
                      style={{ padding: '4px 6px', fontSize: 'var(--fs-caption)' }}
                    >
                      {MEALS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn ghost" onClick={() => setPlan(null)} style={{ flex: 1 }}>
              Re-describe
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!chosen.length && !newDishes.length}
              onClick={confirm}
              style={{ flex: 2 }}
            >
              {chosen.length ? `Log ${chosen.length} Item${chosen.length === 1 ? '' : 's'}` : 'Save'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
