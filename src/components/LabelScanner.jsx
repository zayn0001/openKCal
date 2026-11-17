import { useState } from 'react'
import Dialog from '../Dialog'
import Icon from '../components/Icon'
import { scale } from '../lib/nutrition'
import { today, useStore } from '../store'
import { useUI } from '../store/useUI'
import { api, useSync } from '../sync'

async function toJpegBase64(file, max = 1280) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k)
  canvas.height = Math.round(bmp.height * k)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
}

export default function LabelScanner({ onClose, onSaved, defaultMeal }) {
  const { toast } = useUI.getState()
  const user = useSync((s) => s.user)
  const [labelFile, setLabelFile] = useState(null)
  const [itemFile, setItemFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [parsed, setParsed] = useState(null)
  const [logMeal, setLogMeal] = useState(defaultMeal || 'Breakfast')

  const scan = async (lFile, iFile) => {
    const l = lFile || labelFile
    if (!l) return
    setBusy(true)
    setStatus('Parsing nutrition facts with AI…')
    setParsed(null)

    try {
      const image = await toJpegBase64(l)
      const packageImage = (iFile || itemFile) ? await toJpegBase64(iFile || itemFile) : undefined
      const r = await api('POST', '/api/ai/label', { image, packageImage })
      setBusy(false)
      if (!r.ok) {
        setStatus(r.body?.error || 'Could not parse label. Try taking a closer, well-lit photo.')
        return
      }
      setParsed(r.body.food)
      setStatus('')
    } catch {
      setBusy(false)
      setStatus('Could not reach the AI server to parse this label.')
    }
  }

  const handleLabelChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLabelFile(file)
    scan(file, itemFile)
  }

  const handleItemChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setItemFile(file)
    if (labelFile) scan(labelFile, file)
  }

  const save = (andLog = false) => {
    if (!parsed) return
    const authorName = user?.name || 'Community Member'
    const authorId = user?.id || 'local'
    const newFood = {
      ...parsed,
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'food',
      authorName,
      authorId,
      sharedAt: new Date().toISOString(),
    }

    useStore.getState().addFood(newFood)
    useStore.getState().addSharedRecipe(newFood)
    api('POST', '/api/recipes', newFood).catch(() => {})

    if (andLog) {
      const portionGrams = parsed.portions?.[0]?.grams || 100
      useStore.getState().addEntry(today(), {
        meal: logMeal,
        name: newFood.name,
        grams: portionGrams,
        foodId: newFood.id,
        ...scale(newFood.per100, portionGrams),
      })
      toast(`Saved "${newFood.name}" & logged to ${logMeal}`)
    } else {
      toast(`Saved "${newFood.name}" (shared to all users)`)
    }

    onSaved?.(newFood)
    onClose()
  }

  return (
    <Dialog title="Scan Food Nutrition Label" onClose={onClose} wide>
      <p className="muted" style={{ margin: '0 0 14px' }}>
        Snap a photo of the nutrition label on packaging. Optionally add a photo of the food item or box front to extract the exact brand and product name.
      </p>

      {/* Photo upload inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--fs-caption)', fontWeight: 600, marginBottom: 6 }}>
            1. Nutrition Label (Required)
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleLabelChange}
            className="field"
            aria-label="Photo of nutrition facts label"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'var(--fs-caption)', fontWeight: 600, marginBottom: 6 }}>
            2. Product Front (Optional)
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleItemChange}
            className="field"
            aria-label="Photo of product packaging front"
          />
        </div>
      </div>

      {busy && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <p className="muted" role="status" style={{ margin: 0 }}>
            {status}
          </p>
        </div>
      )}

      {status && !busy && (
        <p className="muted" role="status" style={{ margin: '8px 0', color: 'var(--red)' }}>
          {status}
        </p>
      )}

      {parsed && !busy && (
        <div style={{ marginTop: 8 }}>
          <p className="sect-t">Parsed Food Product</p>
          <div className="sect-b" style={{ marginBottom: 14 }}>
            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Product Name</span>
              </span>
              <input
                value={parsed.name}
                onChange={(e) => setParsed({ ...parsed, name: e.target.value })}
                className="field"
                style={{ width: '180px', textAlign: 'right' }}
              />
            </div>

            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Serving Portion</span>
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  placeholder="e.g. 1 bar"
                  value={parsed.portions?.[0]?.name || ''}
                  onChange={(e) =>
                    setParsed({
                      ...parsed,
                      portions: [{ name: e.target.value, grams: parsed.portions?.[0]?.grams || 100 }],
                    })
                  }
                  className="field"
                  style={{ width: '90px', textAlign: 'right' }}
                />
                <input
                  type="number"
                  value={parsed.portions?.[0]?.grams || 100}
                  onChange={(e) =>
                    setParsed({
                      ...parsed,
                      portions: [{ name: parsed.portions?.[0]?.name || 'serving', grams: +e.target.value }],
                    })
                  }
                  className="num"
                  style={{ width: '60px', textAlign: 'right' }}
                />
                <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--label-2)' }}>g</span>
              </div>
            </div>
          </div>

          <p className="sect-t">Extracted Nutrients (per 100g)</p>
          <div className="sect-b" style={{ marginBottom: 16 }}>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Calories</span></span>
              <span className="lrow-v" style={{ fontWeight: 600 }}>{Math.round(parsed.per100.kcal)} kcal</span>
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Protein</span></span>
              <span className="lrow-v">{parsed.per100.protein} g</span>
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Carbs</span></span>
              <span className="lrow-v">{parsed.per100.carbs} g</span>
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Fat</span></span>
              <span className="lrow-v">{parsed.per100.fat} g</span>
            </div>
            {parsed.per100.fibre !== undefined && (
              <div className="lrow">
                <span className="lrow-m"><span className="lrow-t">Fibre</span></span>
                <span className="lrow-v">{parsed.per100.fibre} g</span>
              </div>
            )}
            {parsed.per100.sugar !== undefined && (
              <div className="lrow">
                <span className="lrow-m"><span className="lrow-t">Sugar</span></span>
                <span className="lrow-v">{parsed.per100.sugar} g</span>
              </div>
            )}
          </div>

          {/* Quick Log Meal Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 'var(--fs-subhead)', color: 'var(--label-2)' }}>Log to Meal:</span>
            <select
              value={logMeal}
              onChange={(e) => setLogMeal(e.target.value)}
              className="field"
              style={{ width: 'auto', padding: '6px 12px' }}
            >
              {['Breakfast', 'Lunch', 'Snack', 'Dinner'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn tinted"
              style={{ flex: 1 }}
              onClick={() => save(false)}
            >
              <Icon name="check" /> Save Food
            </button>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1 }}
              onClick={() => save(true)}
            >
              <Icon name="plus" /> Save & Log to Today
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
