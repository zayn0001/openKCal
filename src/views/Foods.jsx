import { useState } from 'react'
import Icon from '../components/Icon'
import LabelScanner from '../components/LabelScanner'
import Dialog from '../Dialog'
import DishBuilder from '../DishBuilder'
import FoodDetail from '../FoodDetail'
import { FoodSearch } from '../FoodPicker'
import { EXTRAS, INFO, NUTRIENTS } from '../lib/nutrition'
import { energy } from '../lib/units'
import { useAllFoods } from '../foods'
import { useSettings, useStore } from '../store'
import { api, useSync } from '../sync'

function FoodForm({ food, onClose }) {
  const p = food?.per100 || {}
  const portion = food?.portions?.[0]
  const user = useSync((s) => s.user)

  return (
    <Dialog title={food ? `Edit ${food.name}` : 'Add Custom Food'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = Object.fromEntries(new FormData(e.target))
          const per100 = Object.fromEntries(NUTRIENTS.map((k) => [k, +v[k] || 0]))
          for (const k of EXTRAS) if (v[k] !== '') per100[k] = +v[k]
          const authorName = user?.name || 'Community Member'
          const authorId = user?.id || 'local'
          const newFood = {
            ...(food && { id: food.id, source: food.source }),
            name: v.name.trim(),
            per100,
            portions: v.portionName.trim() && +v.portionGrams > 0 ? [{ name: v.portionName.trim(), grams: +v.portionGrams }] : [],
            authorName,
            authorId,
            sharedAt: new Date().toISOString(),
          }
          const savedId = useStore.getState().addFood(newFood)
          const broadcastFood = { ...newFood, id: savedId || newFood.id }
          useStore.getState().addSharedRecipe(broadcastFood)
          api('POST', '/api/recipes', broadcastFood).catch(() => {})
          onClose()
        }}
      >
        <div className="sect-b" style={{ marginBottom: 14 }}>
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Food Name</span>
            </span>
            <input
              name="name"
              required
              maxLength="80"
              defaultValue={food?.name}
              placeholder="e.g. Grilled Chicken Bowl"
              className="field"
              style={{ width: '180px', textAlign: 'right' }}
            />
          </div>
        </div>

        <p className="sect-t">Nutrients per 100g (from food label)</p>
        <div className="sect-b" style={{ marginBottom: 14 }}>
          {[...NUTRIENTS, ...EXTRAS].map((k) => (
            <div key={k} className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">{INFO[k].label.replace('of which ', '')}</span>
                <span className="lrow-s">{k === 'kcal' ? 'kcal' : INFO[k].unit}</span>
              </span>
              <input
                name={k}
                type="number"
                min="0"
                step="any"
                required={k === 'kcal'}
                defaultValue={p[k] ?? ''}
                placeholder={EXTRAS.includes(k) ? 'optional' : '0'}
                className="num"
                style={{ width: '80px', textAlign: 'right' }}
              />
            </div>
          ))}
        </div>

        <p className="sect-t">Standard Serving Portion (Optional)</p>
        <div className="sect-b" style={{ marginBottom: 18 }}>
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Serving Name</span>
            </span>
            <input
              name="portionName"
              placeholder="bowl, slice, portion, cup"
              maxLength="30"
              defaultValue={portion?.name}
              className="field"
              style={{ width: '140px', textAlign: 'right' }}
            />
          </div>
          <div className="lrow">
            <span className="lrow-m">
              <span className="lrow-t">Grams per Serving</span>
            </span>
            <input
              name="portionGrams"
              type="number"
              min="0.1"
              step="any"
              defaultValue={portion?.grams}
              placeholder="e.g. 150"
              className="num"
              style={{ width: '80px', textAlign: 'right' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="submit" className="btn primary" style={{ flex: 2 }}>
            {food ? 'Save Changes' : 'Save Food'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Foods() {
  const foods = useStore((s) => s.foods)
  const sharedRecipes = useStore((s) => s.sharedRecipes) || []
  const { all } = useAllFoods()
  const { units } = useSettings()

  const [filter, setFilter] = useState('All')
  const [open, setOpen] = useState(null)
  const [making, setMaking] = useState(false)
  const [scanningLabel, setScanningLabel] = useState(false)
  const [form, setForm] = useState(null)

  const myDishes = foods.filter((f) => f.kind === 'dish')
  const customIds = new Set(foods.map((f) => f.id))
  const communityDishes = sharedRecipes.filter((r) => r.kind === 'dish' && !customIds.has(r.id))
  const communityFoods = sharedRecipes.filter((r) => r.kind !== 'dish' && !customIds.has(r.id))
  const allDishes = [...myDishes, ...communityDishes]
  const myFoods = foods.filter((f) => f.kind !== 'dish')
  const allCommunity = [...communityDishes, ...communityFoods]

  const filterChips = ['All', 'Community', 'All Recipes', 'My Dishes', 'My Foods', 'High Protein', 'Daily Staples', 'Low Calorie']

  // Filtered food list preview
  const getFilteredList = () => {
    if (filter === 'Community') return allCommunity
    if (filter === 'All Recipes') return allDishes
    if (filter === 'My Dishes') return myDishes
    if (filter === 'My Foods') return myFoods
    if (filter === 'High Protein') return all.filter((f) => (f.per100?.protein || 0) >= 15).slice(0, 40)
    if (filter === 'Low Calorie') return all.filter((f) => (f.per100?.kcal || 0) <= 80).slice(0, 40)
    if (filter === 'Daily Staples') {
      const staples = ['chicken', 'rice', 'eggs', 'salmon', 'oats', 'salad', 'beef', 'tofu', 'pasta', 'avocado', 'yogurt']
      return all.filter((f) => staples.some((st) => f.name.toLowerCase().includes(st))).slice(0, 50)
    }
    return [...myDishes, ...communityDishes, ...myFoods, ...communityFoods].slice(0, 40)
  }

  const displayedFoods = getFilteredList()

  return (
    <>
      <div className="hdr">
        <div>
          <h1>Food Library</h1>
          <p className="sub">Extensive database, custom dishes & recipes</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => setMaking(true)}
        >
          <Icon name="bowl" /> Make Recipe
        </button>
        <button
          type="button"
          className="btn tinted"
          onClick={() => setScanningLabel(true)}
        >
          <Icon name="barcode" /> Scan Label (AI)
        </button>
        <button
          type="button"
          className="btn tinted"
          onClick={() => setForm({})}
        >
          <Icon name="plus" /> Add Food
        </button>
      </div>

      {/* Global Search Bar */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <FoodSearch onChoose={setOpen} autoFocus={false} />
      </div>

      {/* Category Filter Chips */}
      <div className="chips">
        {filterChips.map((chip) => (
          <button
            key={chip}
            type="button"
            className={'chip' + (filter === chip ? ' on' : '')}
            onClick={() => setFilter(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Inset Grouped List */}
      <div className="sect">
        <h2 className="sect-t">
          {filter === 'All'
            ? 'Your Foods & Shared Recipes'
            : filter === 'All Recipes'
              ? `All Recipes (${allDishes.length})`
              : filter === 'My Dishes'
                ? `My Dishes (${myDishes.length})`
                : filter}
        </h2>
        <div className="sect-b">
          {displayedFoods.map((f) => {
            const kcal = Math.round(energy(f.per100.kcal, units.energy))
            const p = Math.round(f.per100.protein || 0)
            const c = Math.round(f.per100.carbs || 0)
            const fat = Math.round(f.per100.fat || 0)
            const isDish = f.kind === 'dish'

            return (
              <button
                key={f.id}
                type="button"
                className="lrow tap"
                onClick={() => setOpen(f)}
              >
                <span
                  className="lrow-i"
                  style={{ '--tint': isDish ? 'var(--acc)' : 'var(--orange)' }}
                >
                  <Icon name={isDish ? 'bowl' : 'utensils'} />
                </span>
                <span className="lrow-m">
                  <span className="lrow-t" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{f.name}</span>
                    {f.authorName && (
                      <span
                        style={{
                          fontSize: '11px',
                          lineHeight: '16px',
                          padding: '1px 7px',
                          borderRadius: '999px',
                          background: 'var(--subtle)',
                          color: isDish ? 'var(--acc)' : 'var(--orange)',
                          fontWeight: 500,
                          border: '1px solid var(--sep)',
                        }}
                      >
                        {isDish ? `Recipe by ${f.authorName}` : `Shared by ${f.authorName}`}
                      </span>
                    )}
                  </span>
                  <span className="lrow-s">
                    P: {p}g · C: {c}g · F: {fat}g{isDish && f.ingredients?.length ? ` · ${f.ingredients.length} ingr` : ' (per 100g)'}
                  </span>
                </span>
                <span className="lrow-v">
                  {kcal} {units.energy}
                </span>
                <Icon name="chevronRight" className="lrow-c" />
              </button>
            )
          })}

          {!displayedFoods.length && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }} className="muted">
              {filter === 'Community'
                ? 'No community items shared yet. Foods and dishes you create are automatically shared here.'
                : filter === 'All Recipes'
                ? 'No recipes created yet. Tap "Make Recipe Dish" to share the first one with all users!'
                : 'No items in this category. Tap “Add Custom Food” or “Make Recipe Dish” to create one.'}
            </div>
          )}
        </div>
      </div>

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
      {scanningLabel && <LabelScanner onClose={() => setScanningLabel(false)} />}
      {form && <FoodForm food={form.id ? form : null} onClose={() => setForm(null)} />}
    </>
  )
}
