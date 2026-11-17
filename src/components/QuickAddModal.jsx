import { useState } from 'react'
import { MEALS } from '../lib/settings'
import { useStore } from '../store'
import { useUI } from '../store/useUI'

export default function QuickAddModal({ date, defaultMeal = 'Lunch', onClose }) {
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [meal, setMeal] = useState(defaultMeal)

  const { addEntry } = useStore.getState()
  const { toast } = useUI.getState()

  const submit = (e) => {
    e.preventDefault()
    if (!kcal || +kcal <= 0) return

    const k = +kcal
    const p = +protein || 0
    const c = +carbs || 0
    const f = +fat || 0
    const grams = p * 4 + c * 4 + f * 9 > 0 ? p + c + f : 100

    addEntry(date, {
      meal,
      name: name.trim() || 'Quick Calorie Log',
      grams,
      kcal: k,
      protein: p,
      carbs: c,
      fat: f,
      fibre: 0,
    })

    toast(`Added ${k} kcal to ${meal}`)
    onClose()
  }

  return (
    <form className="quick-add-form" onSubmit={submit}>
      <h3>Quick Add Calories</h3>
      <p className="muted" style={{ marginBottom: 14 }}>
        Log calories and macros directly without selecting a specific food.
      </p>

      <div className="sect-b">
        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Description</span>
          </span>
          <input
            type="text"
            className="field"
            placeholder="e.g. Dining Out, Snack"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '180px', textAlign: 'right' }}
          />
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Meal Slot</span>
          </span>
          <select
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            className="activity-select"
          >
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Energy (kcal)</span>
            <span className="lrow-s">Required</span>
          </span>
          <input
            type="number"
            min="1"
            required
            className="num"
            placeholder="kcal"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            style={{ width: '90px', textAlign: 'right' }}
          />
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t font-acc">Protein (g)</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            className="num"
            placeholder="0"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            style={{ width: '80px', textAlign: 'right' }}
          />
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t font-orange">Carbs (g)</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            className="num"
            placeholder="0"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            style={{ width: '80px', textAlign: 'right' }}
          />
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t font-pink">Fat (g)</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            className="num"
            placeholder="0"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            style={{ width: '80px', textAlign: 'right' }}
          />
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
        <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
          Cancel
        </button>
        <button type="submit" className="btn primary" style={{ flex: 2 }}>
          Log to Diary
        </button>
      </div>
    </form>
  )
}
