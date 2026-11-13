import { useState } from 'react'
import FoodPicker from '../FoodPicker'
import { NUTRIENTS, recipePer100 } from '../lib/nutrition'
import { useStore } from '../store'

const LABELS = { kcal: 'kcal', protein: 'Protein g', carbs: 'Carbs g', fat: 'Fat g', fibre: 'Fibre g' }

function NewFood() {
  const addFood = useStore((s) => s.addFood)
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        const v = Object.fromEntries(new FormData(e.target))
        addFood({
          name: v.name.trim(),
          per100: Object.fromEntries(NUTRIENTS.map((k) => [k, +v[k] || 0])),
          portions: v.portionName.trim() && +v.portionGrams > 0 ? [{ name: v.portionName.trim(), grams: +v.portionGrams }] : [],
        })
        e.target.reset()
      }}
    >
      <h2>New food</h2>
      <label>
        Name
        <input name="name" required maxLength="80" />
      </label>
      <p className="muted">Per 100 g</p>
      <div className="fields">
        {NUTRIENTS.map((k) => (
          <label key={k}>
            {LABELS[k]}
            <input name={k} type="number" min="0" max={k === 'kcal' ? 900 : 100} step="any" required={k === 'kcal'} />
          </label>
        ))}
      </div>
      <p className="muted">Serving (optional)</p>
      <div className="fields">
        <label>
          Name
          <input name="portionName" placeholder="bowl" maxLength="30" />
        </label>
        <label>
          Grams
          <input name="portionGrams" type="number" min="0.1" step="any" />
        </label>
      </div>
      <button>Save food</button>
    </form>
  )
}

function NewRecipe() {
  const addFood = useStore((s) => s.addFood)
  const [name, setName] = useState('')
  const [servings, setServings] = useState(1)
  const [items, setItems] = useState([]) // [{ name, grams, per100 }]
  const [picking, setPicking] = useState(false)
  const total = items.reduce((g, i) => g + i.grams, 0)

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        if (!items.length) return
        addFood({
          name: name.trim(),
          per100: recipePer100(items),
          portions: [{ name: 'serving', grams: Math.round(total / servings) }],
        })
        setName('')
        setServings(1)
        setItems([])
      }}
    >
      <h2>New recipe</h2>
      <div className="fields">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength="80" />
        </label>
        <label>
          Servings
          <input type="number" min="1" step="1" required value={servings} onChange={(e) => setServings(+e.target.value || 1)} />
        </label>
      </div>
      <ul className="list">
        {items.map((it, i) => (
          <li key={i} className="row">
            <span>{it.name}</span>
            <small>{Math.round(it.grams)} g</small>
            <button type="button" className="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remove ${it.name}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {/* ponytail: uses raw ingredient weight; cooked weight (water lost or absorbed) is not modelled. */}
      <p className="muted">
        {items.length ? `${Math.round(total)} g total · ${Math.round(recipePer100(items).kcal)} kcal / 100 g` : 'Add the ingredients, raw weights.'}
      </p>
      <div className="actions">
        <button type="button" className="ghost" onClick={() => setPicking(true)}>
          + Ingredient
        </button>
        <button disabled={!items.length}>Save recipe</button>
      </div>
      {picking && (
        <FoodPicker
          title="Add ingredient"
          onClose={() => setPicking(false)}
          onPick={(food, grams) => {
            setItems([...items, { name: food.name, grams, per100: food.per100 }])
            setPicking(false)
          }}
        />
      )}
    </form>
  )
}

export default function Foods() {
  const foods = useStore((s) => s.foods)
  const removeFood = useStore((s) => s.removeFood)
  return (
    <>
      <section className="card">
        <h2>My foods</h2>
        <ul className="list">
          {foods.map((f) => (
            <li key={f.id} className="row">
              <span>{f.name}</span>
              <small>{Math.round(f.per100.kcal)} kcal / 100 g</small>
              <button type="button" className="ghost" onClick={() => removeFood(f.id)} aria-label={`Delete ${f.name}`}>
                ✕
              </button>
            </li>
          ))}
          {!foods.length && <li className="muted">Foods and recipes you add show up in search.</li>}
        </ul>
      </section>
      <NewFood />
      <NewRecipe />
    </>
  )
}
