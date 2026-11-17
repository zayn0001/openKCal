import { useState } from 'react'
import { sourceLabel } from './lib/sources'
import { MEALS } from './lib/settings'
import Nutrition from './Nutrition'

export default function FoodAmount({
  food,
  submitLabel = 'Add',
  onSubmit,
  meals = false,
  defaultMeal = 'Lunch',
  children,
}) {
  const portions = [...food.portions, { name: 'g', grams: 1 }]
  const [pi, setPi] = useState(0)
  const [qty, setQty] = useState(food.portions.length ? 1 : 100)
  const [meal, setMeal] = useState(defaultMeal)
  const grams = (qty || 0) * portions[pi].grams
  const portion = portions[pi]
  const amountLabel =
    portion.name === 'g' ? `${Math.round(grams)} g` : `${qty} ${portion.name} (${Math.round(grams)} g)`

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (grams > 0) onSubmit(grams, meal)
      }}
    >
      <div className="sect-b" style={{ marginBottom: 14 }}>
        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Serving Amount</span>
          </span>
          <input
            type="number"
            min="0.1"
            step="any"
            required
            className="num"
            value={qty}
            style={{ width: '80px', textAlign: 'right' }}
            onChange={(e) => setQty(+e.target.value)}
          />
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Portion Unit</span>
          </span>
          <select
            value={pi}
            className="activity-select"
            onChange={(e) => {
              const i = +e.target.value
              setPi(i)
              setQty(portions[i].name === 'g' ? 100 : 1)
            }}
          >
            {portions.map((p, i) => (
              <option key={p.name + i} value={i}>
                {p.name === 'g' ? 'Grams (g)' : `${p.name} (${p.grams} g)`}
              </option>
            ))}
          </select>
        </div>

        {meals && (
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Meal Slot</span>
            </span>
            <select
              value={meal}
              className="activity-select"
              onChange={(e) => setMeal(e.target.value)}
            >
              {MEALS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <Nutrition
          per100={food.per100}
          grams={grams}
          amountLabel={amountLabel}
          source={sourceLabel(food)}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {children}
        <button type="submit" className="btn primary" style={{ flex: 1 }}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
