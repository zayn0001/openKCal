import { useState } from 'react'
import Icon from './components/Icon'
import Dialog from './Dialog'
import DishBuilder from './DishBuilder'
import FoodAmount from './FoodAmount'
import { scale } from './lib/nutrition'
import { energy } from './lib/units'
import { today, useSettings, useStore } from './store'
import { useUI } from './store/useUI'
import { useSync } from './sync'

export default function FoodDetail({ food, onClose, onEditFood }) {
  const { units } = useSettings()
  const [editing, setEditing] = useState(false)
  const { toast } = useUI.getState()
  const user = useSync((s) => s.user)
  const isAuthor = !food.authorId || food.authorId === 'local' || (user && food.authorId === user.id)
  const mine = (!food.source || food.source === 'OFF') && isAuthor

  const remove = () => {
    if (!confirm(`Delete “${food.name}”? Diary entries keep their numbers.`)) return
    useStore.getState().removeFood(food.id)
    toast(`Deleted ${food.name}`)
    onClose()
  }

  if (editing) {
    const dishProp = mine ? food : { ...food, id: undefined, name: `${food.name} (Copy)` }
    return <DishBuilder dish={dishProp} onClose={() => setEditing(false)} onSaved={onClose} />
  }

  return (
    <Dialog title={food.name} onClose={onClose}>
      {food.kind === 'dish' && (
        <div className="sect-b" style={{ marginBottom: 14 }}>
          <div className="lrow" style={{ fontWeight: 600 }}>
            <span className="lrow-m">
              <span className="lrow-t">
                {food.ingredients.length} ingredients · makes {food.servings} serving{food.servings === 1 ? '' : 's'}
              </span>
              {food.authorName && (
                <span className="lrow-s" style={{ color: 'var(--acc)' }}>
                  Recipe by {food.authorName}
                </span>
              )}
            </span>
          </div>
          {food.ingredients.map((it, i) => (
            <div key={i} className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">{it.name}</span>
                <span className="lrow-s">{Math.round(it.grams)} g</span>
              </span>
              <span className="lrow-v">
                {Math.round(energy(scale(it.per100, it.grams).kcal, units.energy))} {units.energy}
              </span>
            </div>
          ))}
        </div>
      )}

      {food.authorName && food.kind !== 'dish' && (
        <div style={{ marginBottom: 12, fontSize: 'var(--fs-caption)', color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sparkles" />
          <span>Shared by {food.authorName}</span>
        </div>
      )}

      <FoodAmount
        food={food}
        meals
        submitLabel="Log to Today"
        onSubmit={(grams, meal) => {
          useStore.getState().addEntry(today(), {
            meal,
            name: food.name,
            grams,
            foodId: food.id,
            ...scale(food.per100, grams),
          })
          toast(`Added ${food.name} to today's ${meal}`)
          onClose()
        }}
      >
        {mine ? (
          <>
            <button type="button" className="btn danger sm" onClick={remove}>
              Delete
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => (food.kind === 'dish' ? setEditing(true) : onEditFood(food))}
            >
              Edit
            </button>
          </>
        ) : food.kind === 'dish' ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setEditing(true)}
          >
            Customize a Copy
          </button>
        ) : null}
      </FoodAmount>
    </Dialog>
  )
}
