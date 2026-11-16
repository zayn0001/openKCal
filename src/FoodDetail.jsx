import { useState } from 'react'
import Dialog from './Dialog'
import DishBuilder from './DishBuilder'
import FoodAmount from './FoodAmount'
import { scale } from './lib/nutrition'
import { energy } from './lib/units'
import { today, useSettings, useStore } from './store'

// One food's nutrition, with logging it straight to today's diary. Your own foods and dishes can
// also be changed or deleted here.
export default function FoodDetail({ food, onClose, onEditFood }) {
  const { units } = useSettings()
  const [editing, setEditing] = useState(false)
  const [logged, setLogged] = useState('')
  const mine = !food.source || food.source === 'OFF'
  const remove = () => {
    if (!confirm(`Delete “${food.name}”? Diary entries keep their numbers.`)) return
    useStore.getState().removeFood(food.id)
    onClose()
  }

  if (editing) return <DishBuilder dish={food} onClose={() => setEditing(false)} onSaved={onClose} />

  return (
    <Dialog title={food.name} onClose={onClose}>
      {food.kind === 'dish' && (
        <details>
          <summary>
            {food.ingredients.length} ingredients · makes {food.servings} serving{food.servings === 1 ? '' : 's'}
          </summary>
          <ul className="list">
            {food.ingredients.map((it, i) => (
              <li key={i} className="row">
                <span>{it.name}</span>
                <small>
                  {Math.round(it.grams)} g · {Math.round(energy(scale(it.per100, it.grams).kcal, units.energy))} {units.energy}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <FoodAmount
        food={food}
        meals
        submitLabel="Log to today"
        onSubmit={(grams, meal) => {
          useStore.getState().addEntry(today(), { meal, name: food.name, grams, foodId: food.id, ...scale(food.per100, grams) })
          setLogged(`Added to today’s ${meal.toLowerCase()}.`)
        }}
      >
        {mine && (
          <>
            <button type="button" className="ghost danger" onClick={remove}>
              Delete
            </button>
            <button type="button" className="ghost" onClick={() => (food.kind === 'dish' ? setEditing(true) : onEditFood(food))}>
              Edit
            </button>
          </>
        )}
      </FoodAmount>
      {logged && (
        <p className="muted" role="status">
          {logged}
        </p>
      )}
    </Dialog>
  )
}
