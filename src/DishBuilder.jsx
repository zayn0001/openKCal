import { useState } from 'react'
import Icon from './components/Icon'
import Dialog from './Dialog'
import FoodPicker from './FoodPicker'
import { buildDish, dishTotals } from './lib/dish'
import { scale } from './lib/nutrition'
import { energy } from './lib/units'
import Nutrition from './Nutrition'
import { useSettings, useStore } from './store'
import { api, useSync } from './sync'

export default function DishBuilder({ dish, start, onClose, onSaved }) {
  const { units } = useSettings()
  const [name, setName] = useState(dish?.name || '')
  const [items, setItems] = useState(dish?.ingredients || start || [])
  const [servings, setServings] = useState(dish?.servings || 1)
  const [cooked, setCooked] = useState(dish?.cookedGrams || '')
  const [picking, setPicking] = useState(false)
  const [view, setView] = useState('serving')
  const draft = buildDish({ name: name || 'Dish', ingredients: items, servings, cookedGrams: +cooked || null })
  const totals = dishTotals(draft)
  const kcal = (v) => `${Math.round(energy(v, units.energy))} ${units.energy}`
  const serving = draft.portions[0]

  const save = (e) => {
    e.preventDefault()
    if (!items.length || !name.trim()) return
    const user = useSync.getState().user
    const newDish = buildDish({
      id: dish?.id,
      created: dish?.created,
      name,
      ingredients: items,
      servings,
      cookedGrams: +cooked || null,
    })
    newDish.authorName = user?.name || dish?.authorName || 'Community Chef'
    newDish.authorId = user?.id || dish?.authorId || 'local'

    const id = useStore.getState().addFood(newDish)
    useStore.getState().addSharedRecipe(newDish)

    // Make available to all other users immediately on server
    api('POST', '/api/recipes', newDish).catch(() => {})

    onSaved?.(id)
  }

  return (
    <Dialog title={dish ? `Edit ${dish.name}` : 'Make Recipe Dish'} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="sect-b" style={{ marginBottom: 14 }}>
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Dish Name</span>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength="80"
              placeholder="Chicken burrito bowl, Greek salad with feta…"
              className="field"
              style={{ width: '180px', textAlign: 'right' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="sect-t" style={{ padding: 0 }}>Ingredients</span>
          <button
            type="button"
            className="btn plain xs"
            onClick={() => setPicking(true)}
          >
            <Icon name="plus" /> Add ingredient
          </button>
        </div>

        <div className="sect-b" style={{ marginBottom: 14 }}>
          {items.map((it, i) => (
            <div key={i} className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">{it.name}</span>
                <span className="lrow-s">{kcal(scale(it.per100, it.grams).kcal)}</span>
              </span>
              <input
                type="number"
                min="1"
                step="any"
                value={Math.round(it.grams * 10) / 10}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) => (j === i ? { ...x, grams: +e.target.value || 0 } : x))
                  )
                }
                className="num"
                style={{ width: '70px', textAlign: 'right' }}
              />
              <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--label-2)' }}>g</span>
              <button
                type="button"
                className="iconbtn"
                style={{ width: 26, height: 26, fontSize: 13 }}
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${it.name}`}
              >
                <Icon name="xmark" />
              </button>
            </div>
          ))}

          {!items.length && (
            <div style={{ padding: '16px', textAlign: 'center' }} className="muted">
              Add each ingredient with its raw weight. Your custom foods work as ingredients too.
            </div>
          )}
        </div>

        <div className="sect-b" style={{ marginBottom: 14 }}>
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Servings it makes</span>
            </span>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={servings}
              className="num"
              style={{ width: '60px', textAlign: 'right' }}
              onChange={(e) => setServings(Math.max(1, Math.round(+e.target.value) || 1))}
            />
          </div>
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Cooked weight (g, optional)</span>
            </span>
            <input
              type="number"
              min="1"
              step="any"
              value={cooked}
              className="num"
              style={{ width: '80px', textAlign: 'right' }}
              onChange={(e) => setCooked(e.target.value)}
              placeholder={draft.rawGrams ? `raw: ${Math.round(draft.rawGrams)}` : ''}
            />
          </div>
        </div>

        {items.length > 0 && (
          <div className="card" style={{ marginBottom: 14, padding: 14 }}>
            <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-title3)', fontWeight: 700 }}>
              {kcal(totals.kcal / draft.servings)}
              <small style={{ fontWeight: 400, fontSize: 'var(--fs-footnote)', color: 'var(--label-2)' }}>
                {' '}per serving{serving ? ` (${serving.grams} g)` : ''} · {kcal(totals.kcal)} in all
              </small>
            </p>
            <div className="seg" style={{ '--n': 2, '--i': view === 'serving' ? 0 : 1, marginBottom: 12 }}>
              <span className="seg-sel" aria-hidden="true" />
              <button
                type="button"
                className={view === 'serving' ? 'on' : ''}
                onClick={() => setView('serving')}
              >
                One serving
              </button>
              <button
                type="button"
                className={view === 'all' ? 'on' : ''}
                onClick={() => setView('all')}
              >
                Whole dish
              </button>
            </div>
            <Nutrition
              per100={draft.per100}
              grams={view === 'serving' ? (serving?.grams ?? 0) : draft.cookedGrams || draft.rawGrams}
              amountLabel={view === 'serving' ? '1 serving' : 'Whole dish'}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!items.length} style={{ flex: 2 }}>
            {dish ? 'Save Changes' : 'Save Dish'}
          </button>
        </div>
      </form>

      {picking && (
        <FoodPicker
          title="Add ingredient"
          onClose={() => setPicking(false)}
          onPick={(food, grams) => {
            if (food.id !== dish?.id)
              setItems([
                ...items,
                {
                  name: food.name,
                  grams,
                  per100: food.per100,
                  foodId: food.id,
                  source: food.source,
                },
              ])
            setPicking(false)
          }}
        />
      )}
    </Dialog>
  )
}
