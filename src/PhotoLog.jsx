import { useEffect, useRef, useState } from 'react'
import { scale } from './lib/nutrition'
import { api } from './sync'

// Shrink the photo before upload: smaller, faster, and plenty for recognising food.
async function toJpegBase64(file, max = 1280) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
}

// Photo of a plate -> AI-estimated items the user corrects, then adds.
// Calls onAdd([{ name, grams, per100 }]).
export default function PhotoLog({ title, onAdd, onClose }) {
  const ref = useRef()
  const [items, setItems] = useState(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!ref.current.open) ref.current.showModal()
  }, [])

  const read = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setStatus('Looking at your plate…')
    setItems(null)
    try {
      const r = await api('POST', '/api/ai/photo', { image: await toJpegBase64(file) })
      if (!r.ok) return setStatus(r.body?.error || 'That did not work. Try again.')
      setItems(r.body.items.map((i) => ({ ...i, on: true })))
      setStatus(r.body.items.length ? '' : 'No food found in that photo.')
    } catch {
      setStatus('Could not read or send that photo.')
    }
  }
  const edit = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const chosen = (items || []).filter((i) => i.on && i.grams > 0)

  return (
    <dialog ref={ref} onClose={onClose}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <input type="file" accept="image/*" capture="environment" onChange={read} aria-label="Photo of your meal" />
      {status && (
        <p className="muted" role="status">
          {status}
        </p>
      )}
      {items?.length > 0 && (
        <>
          <p className="muted">AI estimates. Fix the grams and untick anything wrong.</p>
          <ul className="list">
            {items.map((it, i) => (
              <li key={i} className="row">
                <input
                  type="checkbox"
                  checked={it.on}
                  onChange={(e) => edit(i, { on: e.target.checked })}
                  aria-label={`Include ${it.name}`}
                  style={{ width: 'auto' }}
                />
                <span>{it.name}</span>
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={it.grams}
                  onChange={(e) => edit(i, { grams: +e.target.value })}
                  aria-label={`Grams of ${it.name}`}
                  style={{ width: '5.5rem' }}
                />
                <small>{Math.round(scale(it.per100, it.grams).kcal)} kcal</small>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" disabled={!chosen.length} onClick={() => onAdd(chosen)}>
              Add {chosen.length} item{chosen.length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
