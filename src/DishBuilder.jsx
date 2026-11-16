import { useState } from 'react'
import Dialog from './Dialog'
import FoodPicker from './FoodPicker'
import { buildDish, dishTotals } from './lib/dish'
import { scale } from './lib/nutrition'
import { energy } from './lib/units'
import Nutrition from './Nutrition'
import { useSettings, useStore } from './store'

/**
 * Make a dish by joining ingredients; it is saved with your foods, so it syncs and shows up in
 * every search. `dish` opens an existing one to change it; `start` pre-fills ingredients (for
 * "save this meal as a dish"). Calls onSaved(id).
 */
export default function DishBuilder({ dish, start, onClose, onSaved }) {
  const { units } = useSettings()
  const [name, setName] = useState(dish?.name || '')
  const [items, setItems] = useState(dish?.ingredients || start || [])
  const [servings, setServings] = useState(dish?.servings || 1)
  const [cooked, setCooked] = useState(dish?.cookedGrams || '')
  const [picking, setPicking] = useState(false)
  const [view, setView] = useState('serving') // which amount the nutrition panel shows
  const draft = buildDish({ name: name || 'Dish', ingredients: items, servings, cookedGrams: +cooked || null })
  const totals = dishTotals(draft)
  const kcal = (v) => `${Math.round(energy(v, units.energy))} ${units.energy}`
  const serving = draft.portions[0]

  const save = (e) => {
    e.preventDefault()
    if (!items.length || !name.trim()) return
    const id = useStore.getState().addFood(buildDish({ id: dish?.id, created: dish?.created, name, ingredients: items, servings, cookedGrams: +cooked || null }))
    onSaved?.(id)
  }

  return (
    <Dialog title={dish ? `Edit ${dish.name}` : 'Make a dish'} onClose={onClose} wide>
      <form onSubmit={save}>
        <label>
          Dish name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength="80" placeholder="Rajma chawal, mum’s dal…" />
        </label>

        <h3>Ingredients</h3>
        <ul className="list">
          {items.map((it, i) => (
            <li key={i} className="row">
              <span>{it.name}</span>
              <input
                type="number"
                min="1"
                step="any"
                value={Math.round(it.grams * 10) / 10}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, grams: +e.target.value || 0 } : x)))}
                aria-label={`Grams of ${it.name}`}
                className="grams"
              />
              <small>g · {kcal(scale(it.per100, it.grams).kcal)}</small>
              <button type="button" className="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove ${it.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="actions start">
          <button type="button" className="ghost" onClick={() => setPicking(true)}>
            + Add ingredient
          </button>
        </div>
        {!items.length && <p className="muted">Add each ingredient with its raw weight. Your own foods and dishes work as ingredients too.</p>}

        <div className="fields">
          <label>
            Servings it makes
            <input type="number" min="1" step="1" required value={servings} onChange={(e) => setServings(Math.max(1, Math.round(+e.target.value) || 1))} />
          </label>
          <label>
            Cooked weight, g (optional)
            <input type="number" min="1" step="any" value={cooked} onChange={(e) => setCooked(e.target.value)} placeholder={draft.rawGrams ? `raw: ${Math.round(draft.rawGrams)}` : ''} />
          </label>
        </div>
        <p className="muted">
          Weigh the finished pot if you can: cooking adds or drives off water, which changes what 100 g of the dish holds.
        </p>

        {items.length > 0 && (
          <>
            <p className="big">
              {kcal(totals.kcal / draft.servings)}
              <small> per serving{serving ? ` (${serving.grams} g)` : ''} · {kcal(totals.kcal)} in all</small>
            </p>
            <div className="segmented" role="radiogroup" aria-label="Show nutrition for">
              {[
                ['serving', 'One serving'],
                ['all', 'Whole dish'],
              ].map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}>
                  {label}
                </button>
              ))}
            </div>
            <Nutrition
              per100={draft.per100}
              grams={view === 'serving' ? (serving?.grams ?? 0) : draft.cookedGrams || draft.rawGrams}
              amountLabel={view === 'serving' ? '1 serving' : 'Whole dish'}
            />
          </>
        )}

        <div className="actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button disabled={!items.length}>{dish ? 'Save changes' : 'Save dish'}</button>
        </div>
      </form>
      {picking && (
        <FoodPicker
          title="Add ingredient"
          onClose={() => setPicking(false)}
          onPick={(food, grams) => {
            if (food.id !== dish?.id) setItems([...items, { name: food.name, grams, per100: food.per100, foodId: food.id, source: food.source }])
            setPicking(false)
          }}
        />
      )}
    </Dialog>
  )
}
