import { useEffect, useRef, useState } from 'react'
import { loadFoods } from './foods'
import { scale } from './lib/nutrition'
import { canScan, isBarcode, lookupBarcode } from './lib/off'
import { searchFoods } from './lib/search'
import Scanner from './Scanner'
import { useStore } from './store'

// Search a food, choose a portion, hand back (food, grams).
export default function FoodPicker({ title, onPick, onClose }) {
  const ref = useRef()
  const custom = useStore((s) => s.foods)
  const [q, setQ] = useState('')
  const [food, setFood] = useState(null)
  const [pi, setPi] = useState(0)
  const [qty, setQty] = useState(1)
  const [catalogue, setCatalogue] = useState([])
  const [scanning, setScanning] = useState(false)
  const [note, setNote] = useState('') // barcode lookup progress or failure

  useEffect(() => {
    if (!ref.current.open) ref.current.showModal()
    ref.current.querySelector('input').focus() // showModal would focus the close button
    loadFoods().then(setCatalogue)
  }, [])

  const hits = searchFoods([...custom, ...catalogue], q)
  const portions = food ? [...food.portions, { name: 'g', grams: 1 }] : []
  const grams = food ? qty * portions[pi].grams : 0

  // Packaged food by barcode; a hit is saved to My foods so it works offline next time.
  const lookup = async (code) => {
    setScanning(false)
    setQ(code)
    setNote('Looking up…')
    try {
      const found = custom.find((f) => f.id === `off:${code}`) || (await lookupBarcode(code))
      if (!found) return setNote('Not in Open Food Facts. Add it under Foods.')
      useStore.getState().addFood(found)
      setNote('')
      choose(found)
    } catch {
      setNote('Lookup failed. Check your connection.')
    }
  }

  const choose = (f) => {
    setFood(f)
    setPi(0)
    setQty(f.portions.length ? 1 : 100)
  }
  const changePortion = (i) => {
    setPi(i)
    setQty(portions[i].name === 'g' ? 100 : 1)
  }

  return (
    <dialog ref={ref} onClose={onClose}>
      <header>
        <h2>{food ? food.name : title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      {!food ? (
        <>
          <div className="actions">
            <input type="search" placeholder="Search foods or type a barcode" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {canScan && (
              <button type="button" className="ghost" onClick={() => setScanning(!scanning)}>
                {scanning ? 'Stop' : 'Scan'}
              </button>
            )}
          </div>
          {scanning && <Scanner onCode={lookup} />}
          {note && <p className="muted" role="status">{note}</p>}
          <ul className="list">
            {isBarcode(q.trim()) && (
              <li>
                <button type="button" className="row" onClick={() => lookup(q.trim())}>
                  <span>Look up barcode {q.trim()}</span>
                  <small>Open Food Facts</small>
                </button>
              </li>
            )}
            {hits.map((f) => (
              <li key={f.id}>
                <button type="button" className="row" onClick={() => choose(f)}>
                  <span>{f.name}</span>
                  <small>
                    {f.source || 'Mine'} · {Math.round(f.per100.kcal)} kcal / 100 g
                  </small>
                </button>
              </li>
            ))}
            {!hits.length && !isBarcode(q.trim()) && <li className="muted">Nothing found. Add it under Foods.</li>}
          </ul>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onPick(food, grams)
          }}
        >
          <div className="fields">
            <label>
              Amount
              <input type="number" min="0.1" step="any" required value={qty} onChange={(e) => setQty(+e.target.value)} autoFocus />
            </label>
            <label>
              Unit
              <select value={pi} onChange={(e) => changePortion(+e.target.value)}>
                {portions.map((p, i) => (
                  <option key={p.name} value={i}>
                    {p.name === 'g' ? 'grams' : `${p.name} (${p.grams} g)`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">
            {Math.round(grams)} g · {Math.round(scale(food.per100, grams).kcal)} kcal
          </p>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setFood(null)}>
              Back
            </button>
            <button>Add</button>
          </div>
        </form>
      )}
    </dialog>
  )
}
