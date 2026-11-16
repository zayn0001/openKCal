import { useState } from 'react'
import { ACCENTS, MODULES, PRESETS, presetOf } from '../lib/settings'
import { ACTIVITY, GOAL, targets } from '../lib/targets'
import { fmtEnergy, heightFromCm, heightToCm, weightFromKg, weightToKg } from '../lib/units'
import { latestWeight, useSettings, useStore } from '../store'
import { useSync } from '../sync'

const GOAL_LABEL = { lose: 'Lose weight', hold: 'Maintain', gain: 'Gain weight' }
const ACTIVITY_LABEL = { sedentary: 'Sedentary (desk, little walking)', light: 'Light (some walking, 1–3 workouts)', moderate: 'Moderate (3–5 workouts)', active: 'Active (6–7 workouts, physical job)' }
const r1 = (v) => Math.round(v * 10) / 10

/** A row of choices that behaves like radio buttons. */
export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function ProfilePage() {
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const { units, modules } = useSettings()
  const [saved, setSaved] = useState(false)
  const p = profile || {}
  const t = profile && targets({ ...profile, weightKg: latestWeight(weights) ?? profile.weightKg })
  const wMin = units.weight === 'lb' ? 66 : 30
  const wMax = units.weight === 'lb' ? 660 : 300

  return (
    <>
      <form
        className="card"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault()
          const v = Object.fromEntries(new FormData(e.target))
          useStore.getState().setProfile({
            sex: v.sex,
            activity: v.activity,
            goal: v.goal,
            age: +v.age,
            heightCm: r1(heightToCm(+v.height, units.height)),
            weightKg: r1(weightToKg(+v.weight, units.weight)),
            goalWeightKg: v.goalWeight ? r1(weightToKg(+v.goalWeight, units.weight)) : null,
          })
          setSaved(true)
        }}
      >
        <p className="muted">Used for your daily targets. Change units under Units.</p>
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
            Height ({units.height})
            <input name="height" type="number" step="0.1" min={units.height === 'in' ? 47 : 120} max={units.height === 'in' ? 91 : 230} required defaultValue={p.heightCm ? r1(heightFromCm(p.heightCm, units.height)) : ''} />
          </label>
          <label>
            Weight ({units.weight})
            <input name="weight" type="number" min={wMin} max={wMax} step="0.1" required defaultValue={p.weightKg ? r1(weightFromKg(p.weightKg, units.weight)) : ''} />
          </label>
          <label>
            Activity
            <select name="activity" defaultValue={p.activity || 'light'}>
              {Object.keys(ACTIVITY).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_LABEL[k]}
                </option>
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
          {modules.weight && (
            <label>
              Goal weight ({units.weight}, optional)
              <input name="goalWeight" type="number" min={wMin} max={wMax} step="0.1" defaultValue={p.goalWeightKg ? r1(weightFromKg(p.goalWeightKg, units.weight)) : ''} />
            </label>
          )}
        </div>
        <button>{saved ? 'Saved ✓' : 'Save'}</button>
      </form>

      {t && (
        <section className="card">
          <h2>Daily targets</h2>
          <p className="big">{fmtEnergy(t.kcal, units.energy)}</p>
          <p className="muted">
            Protein {t.protein} g · Carbs {t.carbs} g · Fat {t.fat} g · Fibre {t.fibre} g
          </p>
          <p className="muted">From the Mifflin-St Jeor formula and your latest weigh-in. An estimate, not medical advice.</p>
        </section>
      )}
    </>
  )
}

export function UnitsPage() {
  const { units } = useSettings()
  const set = (patch) => useStore.getState().setSettings('units', { ...units, ...patch })
  return (
    <section className="card">
      <Segmented label="Energy" value={units.energy} options={[['kcal', 'kcal'], ['kJ', 'kJ']]} onChange={(energy) => set({ energy })} />
      <Segmented label="Body weight" value={units.weight} options={[['kg', 'kg'], ['lb', 'lb']]} onChange={(weight) => set({ weight })} />
      <Segmented label="Height" value={units.height} options={[['cm', 'cm'], ['in', 'inches']]} onChange={(height) => set({ height })} />
      <p className="muted">Everything is stored in metric, so switching back and forth loses nothing. Food amounts stay in grams.</p>
    </section>
  )
}

export function LookPage() {
  const { look } = useSettings()
  const set = (patch) => useStore.getState().setSettings('look', { ...look, ...patch })
  return (
    <section className="card">
      <Segmented label="Theme" value={look.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(theme) => set({ theme })} />
      <div className="setting">
        <span>Accent colour</span>
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={look.accent === a} aria-label={a} className={`swatch ${a}`} onClick={() => set({ accent: a })} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function ModulesPage() {
  const { modules } = useSettings()
  const set = (m) => useStore.getState().setSettings('modules', m)
  const preset = presetOf(modules)
  return (
    <section className="card">
      <p className="muted">Switch whole parts of Thally off to keep it simple. Nothing is deleted: switch one back on and everything is where it was.</p>
      <Segmented
        label="Preset"
        value={preset}
        options={[...Object.keys(PRESETS).map((p) => [p, p]), ...(preset === 'Custom' ? [['Custom', 'Custom']] : [])]}
        onChange={(p) => PRESETS[p] && set(PRESETS[p])}
      />
      {Object.entries(MODULES).map(([k, m]) => (
        <Toggle key={k} label={m.label} hint={m.what} checked={!!modules[k]} onChange={(on) => set({ ...modules, [k]: on })} />
      ))}
      <p className="muted">The diary, foods, dishes, search and your targets are the core and are always on.</p>
    </section>
  )
}

export function AboutPage() {
  const server = useSync((s) => s.server)
  const install = /iPhone|iPad/.test(navigator.userAgent) ? 'In Safari: Share → Add to Home Screen' : 'In Chrome or Edge: the install icon in the address bar, or ⋮ → Add to Home screen'
  return (
    <section className="card">
      <p>
        <strong>Thally</strong> {import.meta.env.VITE_VERSION || ''} — a thali you can tally.
      </p>
      <p className="muted">{server ? `Connected to a Thally server, version ${server.version}.` : 'Running on its own in this browser.'}</p>
      <p className="muted">Install it: {install}.</p>
      {server && (
        <p>
          <a href="/welcome#get">Get the Android app</a>
        </p>
      )}
      <h3>Food data</h3>
      <ul className="plain">
        <li>Indian Food Composition Tables 2017, National Institute of Nutrition (ICMR). Copyright NIN.</li>
        <li>USDA Food and Nutrient Database for Dietary Studies 2021–2023. Public domain.</li>
        <li>Open Food Facts, for barcodes. Open Database Licence.</li>
      </ul>
      <p className="muted">Account, admin and integration features follow openGym by Duarte Santos.</p>
      <p className="muted">Targets and AI answers are estimates, not medical advice.</p>
    </section>
  )
}
