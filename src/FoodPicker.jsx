import { useEffect, useState } from 'react'
import Icon from './components/Icon'
import Dialog from './Dialog'
import FoodAmount from './FoodAmount'
import { useAllFoods } from './foods'
import { canScan, isBarcode, lookupBarcode, searchOff } from './lib/off'
import { searchFoods } from './lib/search'
import { sourceTag } from './lib/sources'
import { energy } from './lib/units'
import Scanner from './Scanner'
import { useSettings, useStore } from './store'
import { api } from './sync'

/** The search box with barcode lookup and a list of hits; calls onChoose(food). */
export function FoodSearch({ onChoose, autoFocus = true }) {
  const { custom, all, loaded } = useAllFoods()
  const { units, modules } = useSettings()
  const [q, setQ] = useState('')
  const [scanning, setScanning] = useState(false)
  const [note, setNote] = useState('')
  const [offHits, setOffHits] = useState([])
  const [searchingOff, setSearchingOff] = useState(false)
  const [searchedOffQuery, setSearchedOffQuery] = useState('')

  const hits = searchFoods(all, q)
  const code = q.trim()

  const handleSelectFood = (food) => {
    // If it's from Open Food Facts or not already in custom foods, save to store & community DB
    if (food.source === 'OFF' || !custom.some((c) => c.id === food.id)) {
      useStore.getState().addFood(food)
      useStore.getState().addSharedRecipe(food)
      api('POST', '/api/recipes', food).catch(() => {})
    }
    onChoose(food)
  }

  const triggerOffSearch = async (searchTerm) => {
    const term = (searchTerm || code).trim()
    if (!term || term.length < 2) return
    setSearchingOff(true)
    setNote('')
    try {
      const results = await searchOff(term)
      setOffHits(results)
      setSearchedOffQuery(term)
      if (!results.length) {
        setNote(`No products found on Open Food Facts for “${term}”.`)
      }
    } catch {
      setNote('Open Food Facts search failed. Check your connection.')
    } finally {
      setSearchingOff(false)
    }
  }

  const displayedOffHits = code.length >= 2 ? offHits : []

  // Auto-search Open Food Facts when not found in local library
  useEffect(() => {
    if (!code || isBarcode(code) || code.length < 3) return

    if (hits.length === 0 && code !== searchedOffQuery) {
      const timer = setTimeout(() => {
        triggerOffSearch(code)
      }, 450)
      return () => clearTimeout(timer)
    }
  }, [code, hits.length, searchedOffQuery])

  const lookup = async (barcode) => {
    setScanning(false)
    setQ(barcode)
    setNote('Looking up…')
    try {
      const found = custom.find((f) => f.id === `off:${barcode}`) || (await lookupBarcode(barcode))
      if (!found) return setNote('Not in Open Food Facts. Add it under Foods → Add Custom Food.')
      handleSelectFood(found)
      setNote('')
    } catch {
      setNote('Lookup failed. Check your connection.')
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div className="searchf" style={{ flex: 1 }}>
          <Icon name="magnifier" className="lead" />
          <input
            type="search"
            placeholder={modules.scanner ? 'Search foods or barcode…' : 'Search foods…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus={autoFocus}
            className="field"
            aria-label="Search foods"
          />
          {q && (
            <button
              type="button"
              className="clear"
              onClick={() => {
                setQ('')
                setOffHits([])
                setSearchedOffQuery('')
              }}
              aria-label="Clear"
            >
              <Icon name="xmark" />
            </button>
          )}
        </div>

        {modules.scanner && canScan && (
          <button
            type="button"
            className={'iconbtn' + (scanning ? ' on-ss' : '')}
            onClick={() => setScanning(!scanning)}
            aria-label={scanning ? 'Stop scanner' : 'Scan barcode'}
          >
            <Icon name="barcode" />
          </button>
        )}
      </div>

      {scanning && (
        <div style={{ marginBottom: 12 }}>
          <Scanner onCode={lookup} />
        </div>
      )}

      {note && (
        <p className="muted" role="status" style={{ margin: '6px 0' }}>
          {note}
        </p>
      )}

      <div className="sect-b" style={{ maxHeight: '340px', overflowY: 'auto' }}>
        {modules.scanner && isBarcode(code) && (
          <button type="button" className="lrow tap" onClick={() => lookup(code)}>
            <span className="lrow-i" style={{ '--tint': 'var(--blue)' }}>
              <Icon name="barcode" />
            </span>
            <span className="lrow-m">
              <span className="lrow-t">Look up barcode {code}</span>
              <span className="lrow-s">Open Food Facts</span>
            </span>
            <Icon name="chevronRight" className="lrow-c" />
          </button>
        )}

        {hits.map((f) => {
          const kcal = Math.round(energy(f.per100.kcal, units.energy))
          const p = Math.round(f.per100.protein || 0)
          const isDish = f.kind === 'dish'

          return (
            <button
              key={f.id}
              type="button"
              className="lrow tap"
              onClick={() => handleSelectFood(f)}
            >
              <span
                className="lrow-i"
                style={{ '--tint': isDish ? 'var(--acc)' : 'var(--orange)' }}
              >
                <Icon name={isDish ? 'bowl' : 'utensils'} />
              </span>
              <span className="lrow-m">
                <span className="lrow-t">{f.name}</span>
                <span className="lrow-s">
                  <span className={`tag ${isDish ? 'dish' : f.source ? '' : 'mine'}`}>
                    {sourceTag(f)}
                  </span>{' '}
                  P: {p}g per 100g
                </span>
              </span>
              <span className="lrow-v">
                {kcal} {units.energy}
              </span>
              <Icon name="chevronRight" className="lrow-c" />
            </button>
          )
        })}

        {searchingOff && (
          <div style={{ padding: 14, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} className="muted">
            <Icon name="sparkles" />
            <span>Searching Open Food Facts online…</span>
          </div>
        )}

        {displayedOffHits.length > 0 && (
          <>
            <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Open Food Facts ({displayedOffHits.length})
            </div>
            {displayedOffHits.map((f) => {
              const kcal = Math.round(energy(f.per100.kcal, units.energy))
              const p = Math.round(f.per100.protein || 0)
              return (
                <button
                  key={f.id}
                  type="button"
                  className="lrow tap"
                  onClick={() => handleSelectFood(f)}
                >
                  <span className="lrow-i" style={{ '--tint': 'var(--blue)' }}>
                    <Icon name="sparkles" />
                  </span>
                  <span className="lrow-m">
                    <span className="lrow-t">{f.name}</span>
                    <span className="lrow-s">
                      <span className="tag" style={{ background: 'var(--subtle)', color: 'var(--blue)' }}>
                        Packaged
                      </span>{' '}
                      P: {p}g per 100g
                    </span>
                  </span>
                  <span className="lrow-v">
                    {kcal} {units.energy}
                  </span>
                  <Icon name="chevronRight" className="lrow-c" />
                </button>
              )
            })}
          </>
        )}

        {hits.length > 0 && code.length >= 2 && !displayedOffHits.length && !searchingOff && (
          <button
            type="button"
            className="lrow tap"
            onClick={() => triggerOffSearch(code)}
            style={{ borderTop: '1px solid var(--sep)' }}
          >
            <span className="lrow-i" style={{ '--tint': 'var(--blue)' }}>
              <Icon name="magnifier" />
            </span>
            <span className="lrow-m">
              <span className="lrow-t">Search Open Food Facts for “{code}”</span>
              <span className="lrow-s">Find branded items & packaging online</span>
            </span>
            <Icon name="chevronRight" className="lrow-c" />
          </button>
        )}

        {!hits.length && !displayedOffHits.length && !searchingOff && code && !(modules.scanner && isBarcode(code)) && (
          <div style={{ padding: 18, textAlign: 'center' }} className="muted">
            <p style={{ margin: '0 0 10px' }}>
              {loaded ? `No matching foods found for “${code}”.` : 'Loading food catalog…'}
            </p>
            {loaded && (
              <button
                type="button"
                className="btn pill"
                onClick={() => triggerOffSearch(code)}
                style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name="magnifier" />
                <span>Search Open Food Facts</span>
              </button>
            )}
          </div>
        )}
      </div>
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
          <button type="button" className="btn ghost" onClick={() => setFood(null)}>
            Back
          </button>
        </FoodAmount>
      )}
    </Dialog>
  )
}
