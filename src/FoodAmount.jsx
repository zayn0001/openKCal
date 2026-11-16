import { useState } from 'react'
import { sourceLabel } from './lib/sources'
import { MEALS } from './lib/settings'
import Nutrition from './Nutrition'

// Choose how much of a food (in its portions or grams), see its nutrition for that amount, then
// submit. With `meals`, also which meal it goes to.
export default function FoodAmount({ food, submitLabel = 'Add', onSubmit, meals = false, defaultMeal = 'Lunch', children }) {
  const portions = [...food.portions, { name: 'g', grams: 1 }]
  const [pi, setPi] = useState(0)
  const [qty, setQty] = useState(food.portions.length ? 1 : 100)
  const [meal, setMeal] = useState(defaultMeal)
  const grams = (qty || 0) * portions[pi].grams
  const portion = portions[pi]
  const amountLabel = portion.name === 'g' ? `${Math.round(grams)} g` : `${qty} ${portion.name} (${Math.round(grams)} g)`

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (grams > 0) onSubmit(grams, meal)
      }}
    >
      <div className="fields">
        <label>
          Amount
          <input type="number" min="0.1" step="any" required value={qty} onChange={(e) => setQty(+e.target.value)} />
        </label>
        <label>
          Unit
          <select
            value={pi}
            onChange={(e) => {
              const i = +e.target.value
              setPi(i)
              setQty(portions[i].name === 'g' ? 100 : 1)
            }}
          >
            {portions.map((p, i) => (
              <option key={p.name + i} value={i}>
                {p.name === 'g' ? 'grams' : `${p.name} (${p.grams} g)`}
              </option>
            ))}
          </select>
        </label>
        {meals && (
          <label>
            Meal
            <select value={meal} onChange={(e) => setMeal(e.target.value)}>
              {MEALS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Nutrition per100={food.per100} grams={grams} amountLabel={amountLabel} source={sourceLabel(food)} />
      <div className="actions">
        {children}
        <button>{submitLabel}</button>
      </div>
    </form>
  )
}
