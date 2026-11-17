import { useState, useMemo } from 'react'
import Icon from '../components/Icon'
import LineChart from '../components/LineChart'
import { detectOpenGym, syncOpenGymData, syncRemoteOpenGym } from '../lib/opengym'
import { logStreak } from '../lib/nutrition'
import { fmtWeight, weightFromKg, weightToKg } from '../lib/units'
import { today, useSettings, useStore } from '../store'
import { useUI } from '../store/useUI'

// 'Mon 16 Nov', like openGym
const fmtDay = (iso) =>
  new Date(iso + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export default function Trends() {
  const [range, setRange] = useState('1M')
  const [activeTab, setActiveTab] = useState('weight') // 'weight' | 'measurements' | 'tdee'

  const weights = useStore((s) => s.weights) || {}
  const measurements = useStore((s) => s.measurements) || {}
  const profile = useStore((s) => s.profile)
  const diary = useStore((s) => s.diary) || {}
  const goalWeight = profile?.goalWeightKg
  const { setWeight, removeWeight, setMeasurements } = useStore.getState()
  const { openSheet, toast } = useUI.getState()
  const { units } = useSettings()
  const weightUnit = units.weight

  // Sorted weigh-ins
  const allWeightEntries = Object.entries(weights)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, kg]) => ({
      d,
      y: Math.round(weightFromKg(kg, weightUnit) * 10) / 10,
      label: d,
    }))

  const chartPoints = useMemo(() => {
    if (range === 'All') return allWeightEntries
    const cutoffDays = range === '1W' ? 7 : range === '1M' ? 30 : range === '3M' ? 90 : 365
    const d = new Date()
    d.setDate(d.getDate() - cutoffDays)
    const cutoffIso = d.toLocaleDateString('en-CA')
    return allWeightEntries.filter((p) => p.d >= cutoffIso)
  }, [allWeightEntries, range])

  const currentKg = allWeightEntries.length ? weights[allWeightEntries[allWeightEntries.length - 1].d] : profile?.weightKg
  const startKg = allWeightEntries.length ? weights[allWeightEntries[0].d] : profile?.weightKg
  const deltaKg = currentKg && startKg ? Math.round((currentKg - startKg) * 10) / 10 : 0

  const streak = useMemo(() => logStreak(diary), [diary])

  // BMR & TDEE Calculations
  const age = profile?.age || 28
  const sex = profile?.sex || 'male'
  const heightCm = profile?.heightCm || 175
  const act = profile?.activity || 'moderate'
  const actMultipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 }
  const mult = actMultipliers[act] || 1.55
  const curKgNum = currentKg || 70
  const bmr = Math.round(
    sex === 'female'
      ? 10 * curKgNum + 6.25 * heightCm - 5 * age - 161
      : 10 * curKgNum + 6.25 * heightCm - 5 * age + 5
  )
  const tdee = Math.round(bmr * mult)

  const openLogWeightSheet = () => {
    openSheet((close) => {
      let d = today()
      let w = currentKg ? Math.round(weightFromKg(currentKg, weightUnit) * 10) / 10 : ''

      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setWeight(d, Math.round(weightToKg(+w, weightUnit) * 100) / 100)
            toast(`Logged weigh-in: ${w} ${weightUnit}`)
            close()
          }}
        >
          <h3>Log Body Weight</h3>
          <div className="sect-b">
            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Date</span>
              </span>
              <input
                type="date"
                defaultValue={d}
                max={today()}
                required
                className="activity-select"
                onChange={(e) => (d = e.target.value)}
              />
            </div>
            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Weight ({weightUnit})</span>
              </span>
              <input
                type="number"
                step="0.1"
                min="20"
                max="500"
                required
                defaultValue={w}
                className="num"
                style={{ width: '90px', textAlign: 'right' }}
                onChange={(e) => (w = +e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn primary">
              Save Weigh-in
            </button>
          </div>
        </form>
      )
    })
  }

  const handleSyncOpenGym = async () => {
    const store = useStore.getState()
    if (store.openGymRemote?.connected) {
      const res = await syncRemoteOpenGym(store, true)
      if (res.success) {
        if (res.updated) {
          toast(`Synced from openGym: ${res.stats?.weightsAdded || 0} weigh-ins.`)
        } else {
          toast('openGym weigh-ins are already up to date.')
        }
        return
      }
    }

    const detected = detectOpenGym()
    if (!detected.detected) {
      toast('No openGym connection found. Configure in Settings → openGym Live Sync.', { kind: 'error' })
      return
    }
    const res = syncOpenGymData(detected.raw, store)
    if (res.success) {
      toast(`Synced ${res.weightsAdded} weigh-ins from openGym!`)
    }
  }

  const openLogMeasurementsSheet = () => {
    openSheet((close) => {
      let d = today()
      const curM = measurements[today()] || measurements[Object.keys(measurements).sort().at(-1)] || {}
      let waist = curM.waist || ''
      let chest = curM.chest || ''
      let hips = curM.hips || ''
      let arms = curM.arms || ''
      let bodyFat = curM.bodyFat || ''

      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setMeasurements(d, {
              waist: +waist || undefined,
              chest: +chest || undefined,
              hips: +hips || undefined,
              arms: +arms || undefined,
              bodyFat: +bodyFat || undefined,
            })
            toast('Logged body measurements')
            close()
          }}
        >
          <h3>Log Body Measurements</h3>
          <div className="sect-b">
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Date</span></span>
              <input type="date" defaultValue={d} max={today()} required className="activity-select" onChange={(e) => (d = e.target.value)} />
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Waist (cm)</span></span>
              <input type="number" step="0.5" defaultValue={waist} placeholder="cm" className="num" style={{ width: 80, textAlign: 'right' }} onChange={(e) => (waist = e.target.value)} />
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Chest (cm)</span></span>
              <input type="number" step="0.5" defaultValue={chest} placeholder="cm" className="num" style={{ width: 80, textAlign: 'right' }} onChange={(e) => (chest = e.target.value)} />
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Hips (cm)</span></span>
              <input type="number" step="0.5" defaultValue={hips} placeholder="cm" className="num" style={{ width: 80, textAlign: 'right' }} onChange={(e) => (hips = e.target.value)} />
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Arms (cm)</span></span>
              <input type="number" step="0.5" defaultValue={arms} placeholder="cm" className="num" style={{ width: 80, textAlign: 'right' }} onChange={(e) => (arms = e.target.value)} />
            </div>
            <div className="lrow">
              <span className="lrow-m"><span className="lrow-t">Body Fat %</span></span>
              <input type="number" step="0.1" defaultValue={bodyFat} placeholder="%" className="num" style={{ width: 80, textAlign: 'right' }} onChange={(e) => (bodyFat = e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn primary">Save Measurements</button>
          </div>
        </form>
      )
    })
  }

  const latestM = measurements[Object.keys(measurements).sort().at(-1)] || null

  return (
    <>
      <div className="hdr">
        <div>
          <h1>Progress & Trends</h1>
          <p className="sub">Weight projections, consistency & body stats</p>
        </div>
      </div>

      {/* Consistency Streak Card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="card-head-g font-orange" style={{ fontSize: 22 }}>
            <Icon name="flame" />
          </span>
          <div>
            <span style={{ fontSize: varFs('fs-body'), fontWeight: 700, display: 'block' }}>
              {streak > 0 ? `${streak} day logging streak` : 'No logging streak yet'}
            </span>
            <span className="muted">Consistency is the key to lasting body transformation</span>
          </div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <span className="font-acc" style={{ fontWeight: 700, fontSize: 'var(--fs-title3)', whiteSpace: 'nowrap' }}>
            {streak > 0 ? 'On fire' : 'Log a meal'}
          </span>
        </div>
      </div>

      {/* Sub-view Segments */}
      <div className="seg" style={{ '--n': 3, '--i': activeTab === 'weight' ? 0 : activeTab === 'measurements' ? 1 : 2 }}>
        <span className="seg-sel" aria-hidden="true" />
        <button type="button" className={activeTab === 'weight' ? 'on' : ''} onClick={() => setActiveTab('weight')}>
          Weight Trend
        </button>
        <button type="button" className={activeTab === 'measurements' ? 'on' : ''} onClick={() => setActiveTab('measurements')}>
          Measurements
        </button>
        <button type="button" className={activeTab === 'tdee' ? 'on' : ''} onClick={() => setActiveTab('tdee')}>
          BMR & TDEE
        </button>
      </div>

      {/* WEIGHT TAB */}
      {activeTab === 'weight' && (
        <>
          <div className="card">
            <div className="card-head">
              <div className="card-head-main">
                <span className="card-head-g font-acc">
                  <Icon name="scale" />
                </span>
                <div className="card-head-t">
                  <span className="card-head-title">
                    {currentKg ? fmtWeight(currentKg, weightUnit) : 'No weight logged'}
                  </span>
                  <span className="card-head-sub">
                    {deltaKg !== 0 ? `${deltaKg > 0 ? '+' : ''}${deltaKg} kg since start` : 'Starting weight'}
                    {goalWeight && ` · Goal: ${fmtWeight(goalWeight, weightUnit)}`}
                  </span>
                </div>
              </div>
              <div className="card-head-actions" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={handleSyncOpenGym}
                  title="Sync weigh-ins from openGym"
                >
                  <Icon name="arrowClockwise" /> Sync openGym
                </button>
                <button type="button" className="btn sm tinted" onClick={openLogWeightSheet}>
                  <Icon name="plus" /> Log Weight
                </button>
              </div>
            </div>

            {/* Time Filter Chips */}
            <div style={{ display: 'flex', gap: 6, margin: '10px 0 14px' }}>
              {['1W', '1M', '3M', '1Y', 'All'].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={'chip' + (range === r ? ' on' : '')}
                  style={{ padding: '4px 10px', fontSize: 'var(--fs-caption)' }}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <LineChart
              points={chartPoints}
              unit={weightUnit}
              goal={goalWeight != null ? Math.round(weightFromKg(goalWeight, weightUnit) * 10) / 10 : null}
            />
          </div>

          {/* Weigh-in History Inset List */}
          <div className="sect">
            <h2 className="sect-t">Weigh-in History</h2>
            <div className="sect-b">
              {allWeightEntries.slice(-10).reverse().map((p) => (
                <div key={p.d} className="lrow">
                  <span className="lrow-m">
                    <span className="lrow-t">{fmtDay(p.d)}</span>
                  </span>
                  <span className="lrow-v">{p.y} {weightUnit}</span>
                  <button
                    type="button"
                    className="iconbtn"
                    style={{ width: 28, height: 28, fontSize: 13 }}
                    onClick={() => {
                      removeWeight(p.d)
                      toast(`Deleted weigh-in for ${fmtDay(p.d)}`)
                    }}
                    aria-label={`Delete ${p.d}`}
                  >
                    <Icon name="xmark" />
                  </button>
                </div>
              ))}
              {!allWeightEntries.length && (
                <div style={{ padding: '20px 16px', textAlign: 'center' }} className="muted">
                  No weigh-in logs yet. Tap “Log Weight” to begin.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* MEASUREMENTS TAB */}
      {activeTab === 'measurements' && (
        <>
          <div className="card">
            <div className="card-head">
              <div className="card-head-main">
                <span className="card-head-g font-sky">
                  <Icon name="ruler" />
                </span>
                <div className="card-head-t">
                  <span className="card-head-title">Body Measurements</span>
                  <span className="card-head-sub">Inches & Centimeters over time</span>
                </div>
              </div>
              <button type="button" className="btn sm tinted" onClick={openLogMeasurementsSheet}>
                <Icon name="plus" /> Log Stats
              </button>
            </div>

            {latestM ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
                <div className="macro-capsule">
                  <span className="muted">Waist</span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{latestM.waist ? `${latestM.waist} cm` : '—'}</span>
                </div>
                <div className="macro-capsule">
                  <span className="muted">Chest</span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{latestM.chest ? `${latestM.chest} cm` : '—'}</span>
                </div>
                <div className="macro-capsule">
                  <span className="muted">Hips</span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{latestM.hips ? `${latestM.hips} cm` : '—'}</span>
                </div>
                <div className="macro-capsule">
                  <span className="muted">Arms</span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{latestM.arms ? `${latestM.arms} cm` : '—'}</span>
                </div>
                <div className="macro-capsule">
                  <span className="muted">Body Fat</span>
                  <span style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{latestM.bodyFat ? `${latestM.bodyFat}%` : '—'}</span>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                Track waist, chest, arms, and body fat percentage to monitor recomposition beyond the scale.
              </p>
            )}
          </div>
        </>
      )}

      {/* BMR & TDEE TAB */}
      {activeTab === 'tdee' && (
        <div className="card">
          <div className="card-head">
            <div className="card-head-main">
              <span className="card-head-g font-orange">
                <Icon name="flame" />
              </span>
              <div className="card-head-t">
                <span className="card-head-title">Metabolic Energy Expenditure</span>
                <span className="card-head-sub">Mifflin-St Jeor Formula</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, margin: '12px 0 16px' }}>
            <div className="macro-capsule" style={{ padding: 14 }}>
              <span className="muted">Basal Metabolic Rate</span>
              <span style={{ fontSize: 24, fontWeight: 700, margin: '4px 0' }}>{bmr}</span>
              <span className="muted">kcal / day (at rest)</span>
            </div>
            <div className="macro-capsule" style={{ padding: 14 }}>
              <span className="muted">Maintenance (TDEE)</span>
              <span style={{ fontSize: 24, fontWeight: 700, margin: '4px 0' }} className="font-acc">{tdee}</span>
              <span className="muted">kcal / day ({act})</span>
            </div>
          </div>

          <div className="sect-b">
            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Mild Weight Loss (-0.25 kg/wk)</span>
              </span>
              <span className="lrow-v font-acc">{Math.max(1200, tdee - 250)} kcal</span>
            </div>
            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Moderate Fat Loss (-0.5 kg/wk)</span>
              </span>
              <span className="lrow-v font-acc">{Math.max(1200, tdee - 500)} kcal</span>
            </div>
            <div className="lrow">
              <span className="lrow-m">
                <span className="lrow-t">Lean Muscle Bulk (+0.25 kg/wk)</span>
              </span>
              <span className="lrow-v font-orange">{tdee + 250} kcal</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function varFs(name) {
  return `var(--${name})`
}
