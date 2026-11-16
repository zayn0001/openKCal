import { useState } from 'react'
import Dialog from './Dialog'
import FoodAmount from './FoodAmount'
import { useAllFoods } from './foods'
import { canScan, isBarcode, lookupBarcode } from './lib/off'
import { searchFoods } from './lib/search'
import { sourceTag } from './lib/sources'
import { energy } from './lib/units'
import Scanner from './Scanner'
import { useSettings, useStore } from './store'

/** The search box with barcode lookup and a list of hits; calls onChoose(food). */
export function FoodSearch({ onChoose, autoFocus = true }) {
  const { custom, all, loaded } = useAllFoods()
  const { units, modules } = useSettings()
  const [q, setQ] = useState('')
  const [scanning, setScanning] = useState(false)
  const [note, setNote] = useState('') // barcode lookup progress or failure
  const hits = searchFoods(all, q)
  const code = q.trim()

  // Packaged food by barcode; a hit is saved to your foods so it works offline next time.
  const lookup = async (barcode) => {
    setScanning(false)
    setQ(barcode)
    setNote('Looking up…')
    try {
      const found = custom.find((f) => f.id === `off:${barcode}`) || (await lookupBarcode(barcode))
      if (!found) return setNote('Not in Open Food Facts. Add it under Foods → Add a food.')
      useStore.getState().addFood(found)
      setNote('')
      onChoose(found)
    } catch {
      setNote('Lookup failed. Check your connection.')
    }
  }

  return (
    <>
      <div className="actions">
        <input
          type="search"
          placeholder={modules.scanner ? 'Search foods or type a barcode' : 'Search foods'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={autoFocus}
          aria-label="Search foods"
        />
        {modules.scanner && canScan && (
          <button type="button" className="ghost" onClick={() => setScanning(!scanning)}>
            {scanning ? 'Stop' : 'Scan'}
          </button>
        )}
      </div>
      {scanning && <Scanner onCode={lookup} />}
      {note && (
        <p className="muted" role="status">
          {note}
        </p>
      )}
      <ul className="list">
        {modules.scanner && isBarcode(code) && (
          <li>
            <button type="button" className="row" onClick={() => lookup(code)}>
              <span>Look up barcode {code}</span>
              <small>Open Food Facts</small>
            </button>
          </li>
        )}
        {hits.map((f) => (
          <li key={f.id}>
            <button type="button" className="row" onClick={() => onChoose(f)}>
              <span>{f.name}</span>
              <small>
                <span className={`tag ${f.kind === 'dish' ? 'dish' : f.source ? '' : 'mine'}`}>{sourceTag(f)}</span>{' '}
                {Math.round(energy(f.per100.kcal, units.energy))} {units.energy}/100 g
              </small>
            </button>
          </li>
        ))}
        {!hits.length && code && !(modules.scanner && isBarcode(code)) && (
          <li className="muted">{loaded ? 'Nothing found. Add it under Foods.' : 'Loading foods…'}</li>
        )}
      </ul>
    </>
  )
}

// Search a food, choose an amount (with its nutrition shown), hand back (food, grams).
export default function FoodPicker({ title, onPick, onClose, submitLabel = 'Add' }) {
  const [food, setFood] = useState(null)
  return (
    <Dialog title={food ? food.name : title} onClose={onClose}>
      {!food ? (
        <FoodSearch onChoose={setFood} />
      ) : (
        <FoodAmount food={food} submitLabel={submitLabel} onSubmit={(grams) => onPick(food, grams)}>
          <button type="button" className="ghost" onClick={() => setFood(null)}>
            Back
          </button>
        </FoodAmount>
      )}
    </Dialog>
  )
}
