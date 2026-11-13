import { useState } from 'react'
import Account from '../Account'
import { pick } from '../lib/state'
import { ACTIVITY, GOAL, targets } from '../lib/targets'
import { latestWeight, today, useStore } from '../store'

const GOAL_LABEL = { lose: 'Lose weight', hold: 'Maintain', gain: 'Gain weight' }

function exportData() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pick(useStore.getState()))], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `thally-${today()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function importData(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file || !confirm('Importing replaces everything in this app. Continue?')) return
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    data = null
  }
  if (!useStore.getState().importState(data)) alert('That file is not a Thally export.')
}

export default function Profile() {
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const setProfile = useStore((s) => s.setProfile)
  const [saved, setSaved] = useState(false)
  const p = profile || {}
  const t = profile && targets({ ...profile, weightKg: latestWeight(weights) ?? profile.weightKg })

  return (
    <>
      <form
        className="card"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault()
          const v = Object.fromEntries(new FormData(e.target))
          setProfile({
            sex: v.sex,
            activity: v.activity,
            goal: v.goal,
            age: +v.age,
            heightCm: +v.heightCm,
            weightKg: +v.weightKg,
            goalWeightKg: v.goalWeightKg ? +v.goalWeightKg : null,
          })
          setSaved(true)
        }}
      >
        <h2>Profile</h2>
        <div className="fields">
          <label>
            Sex
            <select name="sex" defaultValue={p.sex || 'female'}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>
          <label>
            Age
            <input name="age" type="number" min="18" max="100" required defaultValue={p.age} />
          </label>
          <label>
            Height (cm)
            <input name="heightCm" type="number" min="120" max="230" step="0.5" required defaultValue={p.heightCm} />
          </label>
          <label>
            Weight (kg)
            <input name="weightKg" type="number" min="30" max="300" step="0.1" required defaultValue={p.weightKg} />
          </label>
          <label>
            Activity
            <select name="activity" defaultValue={p.activity || 'light'}>
              {Object.keys(ACTIVITY).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Goal
            <select name="goal" defaultValue={p.goal || 'hold'}>
              {Object.keys(GOAL).map((k) => (
                <option key={k} value={k}>
                  {GOAL_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Goal weight (kg, optional)
            <input name="goalWeightKg" type="number" min="30" max="300" step="0.1" defaultValue={p.goalWeightKg ?? ''} />
          </label>
        </div>
        <button>{saved ? 'Saved ✓' : 'Save'}</button>
      </form>

      {t && (
        <section className="card">
          <h2>Daily targets</h2>
          <p className="big">
            {t.kcal}
            <small> kcal</small>
          </p>
          <p className="muted">
            Protein {t.protein} g · Carbs {t.carbs} g · Fat {t.fat} g · Fibre {t.fibre} g
          </p>
          <p className="muted">An estimate from a standard formula, not medical advice.</p>
        </section>
      )}

      <Account />

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">Everything is stored in this browser, and on your server if you sign in. Export a backup now and then.</p>
        <div className="actions">
          <button type="button" className="ghost" onClick={exportData}>
            Export JSON
          </button>
          <button type="button" className="ghost" onClick={(e) => e.currentTarget.nextSibling.click()}>
            Import JSON
          </button>
          <input type="file" accept="application/json,.json" hidden onChange={importData} />
        </div>
      </section>
    </>
  )
}
