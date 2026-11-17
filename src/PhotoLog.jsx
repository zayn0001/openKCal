import { useState } from 'react'
import Dialog from './Dialog'
import Icon from './components/Icon'
import { scale } from './lib/nutrition'
import { buildDish } from './lib/dish'
import { useStore } from './store'
import { useUI } from './store/useUI'
import { api, useSync } from './sync'

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

export default function PhotoLog({ title, onAdd, onAddDish, onClose }) {
  const { toast } = useUI.getState()
  const user = useSync((s) => s.user)
  const [items, setItems] = useState(null)
  const [dishName, setDishName] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState(null)

  const read = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setStatus('Analyzing your meal plate with AI…')
    setItems(null)
    try {
      const r = await api('POST', '/api/ai/photo', { image: await toJpegBase64(file) })
      if (!r.ok) return setStatus(r.body?.error || 'That did not work. Try again.')
      const loadedItems = r.body.items || []
      setItems(loadedItems.map((i) => ({ ...i, on: true })))
      if (r.body.dish?.name) {
        setDishName(r.body.dish.name)
      } else if (loadedItems.length) {
        setDishName(loadedItems.map((i) => i.name).slice(0, 3).join(' with '))
      }
      setStatus(loadedItems.length ? '' : 'No food recognized in that photo.')
    } catch {
      setStatus('Could not read or process that photo.')
    }
  }

  const edit = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const chosen = (items || []).filter((i) => i.on && i.grams > 0)

  const saveDish = () => {
    if (!chosen.length) return
    const authorName = user?.name || 'Community Member'
    const authorId = user?.id || 'local'
    const ingredients = chosen.map((i) => ({
      name: i.name,
      grams: i.grams,
      per100: i.per100,
    }))
    const dish = buildDish({
      name: dishName.trim() || 'Custom Recipe Dish',
      ingredients,
      servings: 1,
    })
    const newDish = {
      ...dish,
      id: `dish_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'dish',
      authorName,
      authorId,
      sharedAt: new Date().toISOString(),
    }

    useStore.getState().addFood(newDish)
    useStore.getState().addSharedRecipe(newDish)
    api('POST', '/api/recipes', newDish).catch(() => {})

    toast(`Created recipe "${newDish.name}" (shared to all users)`)

    if (onAddDish) {
      onAddDish(newDish)
    } else {
      onAdd([{
        name: newDish.name,
        grams: newDish.rawGrams,
        per100: newDish.per100,
        foodId: newDish.id,
      }])
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Capture or upload a meal photo. Your AI recognizes dishes, estimates portions, and lets you verify before logging.
      </p>

      <div style={{ marginBottom: 14 }}>
        {!preview ? (
          <label className="upload-dropzone" style={{ padding: '24px 16px' }}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={read}
              style={{ display: 'none' }}
              aria-label="Photo of your meal"
            />
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--acc-soft)', color: 'var(--acc-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
              <Icon name="camera" />
            </div>
            <span style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--label)', marginTop: 4 }}>
              Take or Upload Meal Photo
            </span>
            <span className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
              Camera snapshot or photo from gallery
            </span>
          </label>
        ) : (
          <div className="upload-preview-box">
            <img src={preview} alt="Meal preview" className="upload-preview-img" style={{ height: 160 }} />
            <div className="upload-preview-actions">
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon name="check" size={14} /> Photo Attached
              </span>
              <label className="btn sm tinted" style={{ cursor: 'pointer', margin: 0 }}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={read}
                  style={{ display: 'none' }}
                />
                Retake Photo
              </label>
            </div>
          </div>
        )}
      </div>

      {status && (
        <p className="muted" role="status" style={{ margin: '8px 0' }}>
          {status}
        </p>
      )}

      {items?.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p className="sect-t" style={{ margin: 0 }}>Detected Dishes & Ingredients</p>
          </div>

          <div className="sect-b" style={{ marginBottom: 14 }}>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Dish Title</span></span>
              <input
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                placeholder="Recipe dish name"
                className="field"
                style={{ width: '180px', textAlign: 'right' }}
              />
            </div>
            {items.map((it, i) => (
              <div key={i} className="lrow">
                <input
                  type="checkbox"
                  checked={it.on}
                  onChange={(e) => edit(i, { on: e.target.checked })}
                  aria-label={`Include ${it.name}`}
                  className="chk on"
                  style={{ width: 'auto', marginRight: 6 }}
                />
                <span className="lrow-m">
                  <span className="lrow-t">{it.name}</span>
                  <span className="lrow-s">{Math.round(scale(it.per100, it.grams).kcal)} kcal</span>
                </span>
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={it.grams}
                  onChange={(e) => edit(i, { grams: +e.target.value })}
                  aria-label={`Grams of ${it.name}`}
                  className="num"
                  style={{ width: '70px', textAlign: 'right' }}
                />
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--label-2)' }}>g</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn tinted"
                disabled={!chosen.length}
                onClick={saveDish}
                style={{ flex: 1 }}
              >
                <Icon name="bowl" /> Save as Recipe Dish & Log
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!chosen.length}
                onClick={() => onAdd(chosen)}
                style={{ flex: 1 }}
              >
                <Icon name="check" /> Log {chosen.length} Item{chosen.length === 1 ? '' : 's'}
              </button>
            </div>
            <button type="button" className="btn ghost sm" onClick={onClose} style={{ alignSelf: 'center' }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}
