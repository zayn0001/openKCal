import { useState } from 'react'
import Icon from '../components/Icon'
import CalorieRing from '../components/CalorieRing'
import WaterTracker from '../components/WaterTracker'
import FastingTracker from '../components/FastingTracker'
import ExerciseTracker from '../components/ExerciseTracker'
import DietQualityScore from '../components/DietQualityScore'
import QuickAddModal from '../components/QuickAddModal'
import DescribeMeal from '../DescribeMeal'
import DishBuilder from '../DishBuilder'
import FoodPicker from '../FoodPicker'
import PhotoLog from '../PhotoLog'
import LabelScanner from '../components/LabelScanner'
import Nutrition from '../Nutrition'
import { per100Of, scale, sum } from '../lib/nutrition'
import { shiftDate, weekSummary } from '../lib/week'
import { dayTargets, today, useSettings, useStore } from '../store'
import { useUI } from '../store/useUI'
import { api, useSync } from '../sync'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MEAL_SLOTS = ['Breakfast', 'Morning Snack', 'Lunch', 'Evening Snack', 'Dinner']

function Review({ date, goal }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    const summary = weekSummary(useStore.getState(), goal, date)
    const r = await api('POST', '/api/ai/review', { summary }).catch(() => null)
    setText(r?.ok ? r.body.text : r?.body?.error || 'Could not get a review. Try again.')
    setBusy(false)
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-main">
          <span className="card-head-g font-acc">
            <Icon name="sparkles" />
          </span>
          <div className="card-head-t">
            <span className="card-head-title">Weekly AI Diet Review</span>
            <span className="card-head-sub">Insights on your last 7 days</span>
          </div>
        </div>
        <button type="button" className="btn sm tinted" onClick={run} disabled={busy}>
          {busy ? 'Analyzing…' : 'Review'}
        </button>
      </div>
      {text && <pre className="review" style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--fs-subhead)', margin: '10px 0 0' }}>{text}</pre>}
    </div>
  )
}

function EntryDetailSheet({ date, entry, onClose }) {
  const [grams, setGrams] = useState(Math.round(entry.grams * 10) / 10)
  const [meal, setMeal] = useState(entry.meal)
  const per100 = per100Of(entry)
  const { updateEntry, removeEntry } = useStore.getState()
  const { toast } = useUI.getState()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        updateEntry(date, entry.id, { meal, grams, ...scale(per100, grams) })
        toast(`Updated ${entry.name}`)
        onClose()
      }}
    >
      <h3>{entry.name}</h3>

      <div className="sect-b">
        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Serving weight</span>
            <span className="lrow-s">Grams</span>
          </span>
          <input
            type="number"
            min="0.1"
            step="any"
            required
            className="num"
            value={grams}
            style={{ width: '80px', textAlign: 'right' }}
            onChange={(e) => setGrams(+e.target.value)}
          />
        </div>

        <div className="lrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '10px 14px' }}>
          <span className="lrow-t" style={{ fontSize: 'var(--fs-caption)', color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Meal Slot
          </span>
          <div className="chips" style={{ margin: 0, padding: 0 }}>
            {MEAL_SLOTS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${meal === m ? 'on' : ''}`}
                onClick={() => setMeal(m)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ margin: '14px 0' }}>
        <Nutrition per100={per100} grams={grams || 0} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          type="button"
          className="btn danger"
          style={{ flex: 1 }}
          onClick={() => {
            removeEntry(date, entry.id)
            toast(`Removed ${entry.name}`, {
              action: 'Undo',
              onAction: () => useStore.getState().addEntry(date, entry),
            })
            onClose()
          }}
        >
          <Icon name="trash" /> Delete
        </button>
        <button type="submit" className="btn primary" style={{ flex: 2 }}>
          Save Changes
        </button>
      </div>
    </form>
  )
}

export default function Diary() {
  const [date, setDate] = useState(today)
  const [addTo, setAddTo] = useState(null)
  const [photoTo, setPhotoTo] = useState(null)
  const [labelTo, setLabelTo] = useState(null)
  const [quickAddTo, setQuickAddTo] = useState(null)
  const [dishFrom, setDishFrom] = useState(null)
  const [describing, setDescribing] = useState(false)
  const [showNutrients, setShowNutrients] = useState(false)

  const { units, modules } = useSettings()
  const user = useSync((s) => s.user)
  const aiReady = modules.ai && !!user?.ai?.ready
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const entries = useStore((s) => s.diary[date]) || []
  const glasses = useStore((s) => s.water[date]) || 0
  const exercises = useStore((s) => s.exercises?.[date]) || []
  const burnedKcal = exercises.reduce((acc, x) => acc + (x.kcal || 0), 0)

  const { addEntry, removeEntry, addWater } = useStore.getState()
  const { openSheet, toast } = useUI.getState()

  const eaten = sum(entries)
  const goal = dayTargets(profile, weights)

  // Calculate dates for week scrubber
  const curDateObj = new Date(date + 'T12:00:00')
  const weekStart = new Date(curDateObj)
  weekStart.setDate(curDateObj.getDate() - curDateObj.getDay())
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    const iso = d.toLocaleDateString('en-CA')
    return {
      iso,
      dayNum: d.getDate(),
      dayName: DAYS[d.getDay()],
      isCur: iso === date,
      isToday: iso === today(),
    }
  })

  // Group entries by meal slot
  const mealGroups = {}
  for (const slot of MEAL_SLOTS) mealGroups[slot] = []
  for (const e of entries) {
    const m = e.meal === 'Snack' ? 'Morning Snack' : e.meal
    if (!mealGroups[m]) mealGroups[m] = []
    mealGroups[m].push(e)
  }

  const handleRemove = (e) => {
    removeEntry(date, e.id)
    toast(`Removed ${e.name}`, {
      action: 'Undo',
      onAction: () => addEntry(date, e),
    })
  }

  return (
    <>
      {/* Top Header Bar */}
      <div className="date-header-wrap">
        <div className="datebar">
          <button
            type="button"
            className="iconbtn"
            onClick={() => setDate(shiftDate(date, -1))}
            aria-label="Previous day"
          >
            <Icon name="chevronLeft" />
          </button>
          <span className="date-title">
            {date === today() ? 'Today' : curDateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button
            type="button"
            className="iconbtn"
            onClick={() => setDate(shiftDate(date, 1))}
            aria-label="Next day"
          >
            <Icon name="chevronRight" />
          </button>
        </div>

        {/* 7-Day Scrubber Strip */}
        <div className="week-strip">
          {weekDays.map((wd) => (
            <div
              key={wd.iso}
              className={'wday' + (wd.isCur ? ' today' : '')}
              onClick={() => setDate(wd.iso)}
            >
              <span className="lbl">{wd.dayName}</span>
              <span className="num">{wd.dayNum}</span>
              <div className={'dot' + (useStore.getState().diary[wd.iso]?.length ? ' done' : '')} />
            </div>
          ))}
        </div>
      </div>

      {/* Calorie & Macro Dashboard Gauge */}
      <CalorieRing eaten={eaten} goal={goal} burned={burnedKcal} units={units} />

      {/* AI Voice & Natural Language Logging Banner */}
      {aiReady && (
        <button
          type="button"
          className="card tappable"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}
          onClick={() => setDescribing(true)}
        >
          <span className="card-head-g font-acc" style={{ fontSize: 20 }}>
            <Icon name="chat" />
          </span>
          <div style={{ flex: 1, textAlign: 'start' }}>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, display: 'block' }}>
              Describe meal to openKCal
            </span>
            <span className="muted">Voice or natural text e.g. “Grilled chicken with brown rice and salad”</span>
          </div>
          <Icon name="chevronRight" className="lrow-c" />
        </button>
      )}

      {/* Meal Slots (Breakfast, Morning Snack, Lunch, Evening Snack, Dinner) */}
      {MEAL_SLOTS.map((slot) => {
        const items = mealGroups[slot] || []
        const slotKcal = Math.round(sum(items).kcal || 0)

        return (
          <div key={slot} className="card meal-card">
            <div className="meal-header">
              <div className="meal-head-left">
                <h3 className="meal-name">{slot}</h3>
                {slotKcal > 0 && <span className="meal-kcal-badge">{slotKcal} kcal</span>}
              </div>
              <div className="meal-actions">
                {aiReady && (
                  <>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 30, height: 30, fontSize: 14 }}
                      onClick={() => setPhotoTo(slot)}
                      title="AI Photo Meal Recognition"
                      aria-label={`Snap photo for ${slot}`}
                    >
                      <Icon name="camera" />
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      style={{ width: 30, height: 30, fontSize: 14 }}
                      onClick={() => setLabelTo(slot)}
                      title="Scan Food Nutrition Label"
                      aria-label={`Scan food label for ${slot}`}
                    >
                      <Icon name="barcode" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="iconbtn"
                  style={{ width: 30, height: 30, fontSize: 14 }}
                  onClick={() => setQuickAddTo(slot)}
                  aria-label={`Quick add calories to ${slot}`}
                >
                  <Icon name="bolt" />
                </button>
                <button
                  type="button"
                  className="btn sm tinted"
                  onClick={() => setAddTo(slot)}
                >
                  <Icon name="plus" /> Add
                </button>
              </div>
            </div>

            {items.length > 0 ? (
              <div className="meal-items">
                {items.map((it) => (
                  <div key={it.id} className="food-item-row">
                    <button
                      type="button"
                      className="food-info-btn"
                      onClick={() =>
                        openSheet((close) => (
                          <EntryDetailSheet date={date} entry={it} onClose={close} />
                        ))
                      }
                    >
                      <span className="food-title">{it.name}</span>
                      <span className="food-meta">
                        {Math.round(it.grams)} g · P: {Math.round(it.protein || 0)}g · C: {Math.round(it.carbs || 0)}g · F: {Math.round(it.fat || 0)}g
                      </span>
                    </button>
                    <div className="food-right-col">
                      <span className="food-kcal">{Math.round(it.kcal)}</span>
                      <button
                        type="button"
                        className="iconbtn"
                        style={{ width: 26, height: 26, fontSize: 13 }}
                        onClick={() => handleRemove(it)}
                        aria-label={`Remove ${it.name}`}
                      >
                        <Icon name="xmark" />
                      </button>
                    </div>
                  </div>
                ))}

                {items.length > 1 && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: 'var(--hair) solid var(--sep-op)' }}>
                    <button
                      type="button"
                      className="btn plain sm"
                      onClick={() => setDishFrom(items)}
                    >
                      <Icon name="copy" /> Save this meal as a recipe dish
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--fs-footnote)' }}>
                No food logged for {slot.toLowerCase()}.
              </p>
            )}
          </div>
        )
      })}

      {/* Water Tracker Card */}
      {modules.water && (
        <WaterTracker date={date} glasses={glasses} onAddWater={addWater} />
      )}

      {/* Intermittent Fasting Card */}
      <FastingTracker />

      {/* Exercise / Workout Calorie Burn Card */}
      <ExerciseTracker date={date} />

      {/* Daily Diet Quality Score (HealthifyMe RIA Score) */}
      <DietQualityScore totals={eaten} goal={goal} />

      {/* Full Micronutrients Details Accordion */}
      {entries.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-head-main">
              <span className="card-head-g">
                <Icon name="list" />
              </span>
              <div className="card-head-t">
                <span className="card-head-title">Micronutrient Breakdown</span>
                <span className="card-head-sub">Vitamins, Minerals, Sodium & Sugar</span>
              </div>
            </div>
            <button
              type="button"
              className="iconbtn"
              onClick={() => setShowNutrients(!showNutrients)}
              aria-label="Toggle nutrients"
            >
              <Icon name={showNutrients ? 'chevronUp' : 'chevronDown'} />
            </button>
          </div>
          {showNutrients && (
            <div style={{ marginTop: 12 }}>
              <Nutrition totals={eaten} known={eaten.known} amountLabel="Day Total" />
            </div>
          )}
        </div>
      )}

      {/* Weekly AI Review */}
      {aiReady && <Review date={date} goal={goal} />}

      {/* Dialogs and Sheets */}
      {photoTo && (
        <PhotoLog
          title={`Photo for ${photoTo.toLowerCase()}`}
          onClose={() => setPhotoTo(null)}
          onAdd={(items) => {
            for (const it of items)
              addEntry(date, {
                meal: photoTo,
                name: it.name,
                grams: it.grams,
                ...(it.foodId && { foodId: it.foodId }),
                ...scale(it.per100, it.grams),
              })
            toast(`Logged photo items to ${photoTo}`)
            setPhotoTo(null)
          }}
          onAddDish={(dish) => {
            addEntry(date, {
              meal: photoTo,
              name: dish.name,
              grams: dish.rawGrams,
              foodId: dish.id,
              ...scale(dish.per100, dish.rawGrams),
            })
            toast(`Created recipe "${dish.name}" & logged to ${photoTo}`)
            setPhotoTo(null)
          }}
        />
      )}

      {labelTo && (
        <LabelScanner
          defaultMeal={labelTo}
          onClose={() => setLabelTo(null)}
          onSaved={() => setLabelTo(null)}
        />
      )}

      {addTo && (
        <FoodPicker
          title={`Add to ${addTo}`}
          onClose={() => setAddTo(null)}
          onPick={(food, grams) => {
            addEntry(date, {
              meal: addTo,
              name: food.name,
              grams,
              foodId: food.id,
              ...scale(food.per100, grams),
            })
            toast(`Added ${food.name} to ${addTo}`)
            setAddTo(null)
          }}
        />
      )}

      {quickAddTo && (
        <div className="sheet-backdrop" onClick={() => setQuickAddTo(null)}>
          <div className="center" onClick={(e) => e.stopPropagation()}>
            <QuickAddModal
              date={date}
              defaultMeal={quickAddTo}
              onClose={() => setQuickAddTo(null)}
            />
          </div>
        </div>
      )}

      {describing && (
        <DescribeMeal date={date} onClose={() => setDescribing(false)} />
      )}

      {dishFrom && (
        <DishBuilder
          start={dishFrom.map((e) => ({
            name: e.name,
            grams: e.grams,
            per100: per100Of(e),
            ...(e.foodId && { foodId: e.foodId }),
          }))}
          onClose={() => setDishFrom(null)}
          onSaved={() => {
            toast('Saved custom dish!')
            setDishFrom(null)
          }}
        />
      )}
    </>
  )
}
