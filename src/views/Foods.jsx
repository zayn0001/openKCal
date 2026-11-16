import { useState } from 'react'
import Dialog from '../Dialog'
import DishBuilder from '../DishBuilder'
import FoodDetail from '../FoodDetail'
import { FoodSearch } from '../FoodPicker'
import { EXTRAS, INFO, NUTRIENTS } from '../lib/nutrition'
import { energy } from '../lib/units'
import { useSettings, useStore } from '../store'

// Add or change one of your own foods. Values are per 100 g, as on a label.
function FoodForm({ food, onClose }) {
  const p = food?.per100 || {}
  const portion = food?.portions?.[0]
  return (
    <Dialog title={food ? `Edit ${food.name}` : 'Add a food'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = Object.fromEntries(new FormData(e.target))
          const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, +v[k] || 0]))
          for (const k of EXTRAS) if (v[k] !== '') per100[k] = +v[k]
          useStore.getState().addFood({
            ...(food && { id: food.id, source: food.source }),
            name: v.name.trim(),
            per100,
            portions: v.portionName.trim() && +v.portionGrams > 0 ? [{ name: v.portionName.trim(), grams: +v.portionGrams }] : [],
          })
          onClose()
        }}
      >
        <label>
          Name
          <input name="name" required maxLength="80" defaultValue={food?.name} />
        </label>
        <p className="muted">Per 100 g, from the label. Energy is in kcal.</p>
        <div className="fields">
          {[...NUTRIENTS, ...EXTRAS].map((k) => (
            <label key={k}>
              {INFO[k].label.replace('of which ', '')} ({k === 'kcal' ? 'kcal' : INFO[k].unit})
              <input
                name={k}
                type="number"
                min="0"
                max={k === 'kcal' ? 900 : k === 'sodium' ? 40000 : 100}
                step="any"
                required={k === 'kcal'}
                defaultValue={p[k] ?? ''}
                placeholder={EXTRAS.includes(k) ? 'optional' : undefined}
              />
            </label>
          ))}
        </div>
        <p className="muted">A serving, if the food comes in one (optional)</p>
        <div className="fields">
          <label>
            Serving name
            <input name="portionName" placeholder="bowl, piece, scoop" maxLength="30" defaultValue={portion?.name} />
          </label>
          <label>
            Grams
            <input name="portionGrams" type="number" min="0.1" step="any" defaultValue={portion?.grams} />
          </label>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button>{food ? 'Save changes' : 'Save food'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function FoodList({ title, foods, empty, onOpen }) {
  const { units } = useSettings()
  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="list">
        {foods.map((f) => (
          <li key={f.id}>
            <button type="button" className="row" onClick={() => onOpen(f)}>
              <span>{f.name}</span>
              <small>
                {f.kind === 'dish' && f.portions[0]
                  ? `${Math.round(energy((f.per100.kcal * f.portions[0].grams) / 100, units.energy))} ${units.energy}/serving`
                  : `${Math.round(energy(f.per100.kcal, units.energy))} ${units.energy}/100 g`}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {!foods.length && <p className="muted">{empty}</p>}
    </section>
  )
}

export default function Foods() {
  const foods = useStore((s) => s.foods)
  const [open, setOpen] = useState(null) // food whose detail is showing
  const [making, setMaking] = useState(false)
  const [form, setForm] = useState(null) // false: closed, null: new, food: editing
  const dishes = foods.filter((f) => f.kind === 'dish')
  const own = foods.filter((f) => f.kind !== 'dish')

  return (
    <>
      <div className="actions spread">
        <button type="button" onClick={() => setMaking(true)}>
          Make a dish
        </button>
        <button type="button" className="ghost" onClick={() => setForm({})}>
          Add a food
        </button>
      </div>

      <section className="card">
        <h2>Look up any food</h2>
        <FoodSearch onChoose={setOpen} autoFocus={false} />
      </section>

      <FoodList title="My dishes" foods={dishes} onOpen={setOpen} empty="Join ingredients into a dish with “Make a dish”. It is saved to your account and shows up in every search." />
      <FoodList title="My foods" foods={own} onOpen={setOpen} empty="Foods you add, and packaged foods you look up by barcode, show up here." />

      {open && (
        <FoodDetail
          food={open}
          onClose={() => setOpen(null)}
          onEditFood={(f) => {
            setOpen(null)
            setForm(f)
          }}
        />
      )}
      {making && <DishBuilder onClose={() => setMaking(false)} onSaved={() => setMaking(false)} />}
      {form && <FoodForm food={form.id ? form : null} onClose={() => setForm(null)} />}
    </>
  )
}
