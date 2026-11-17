import { useState } from 'react'
import { isNativeApp } from '../api'
import Icon from '../components/Icon'
import { newVersionReady } from '../lib/update'
import { MODULES, PRESETS, presetOf } from '../lib/settings'
import { ACTIVITY } from '../lib/targets'
import { fmtEnergy, heightFromCm, heightToCm, weightFromKg, weightToKg } from '../lib/units'
import { dayTargets, latestWeight, useSettings, useStore } from '../store'
import { useUI } from '../store/useUI'
import { useSync } from '../sync'

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
  const [sex, setSex] = useState(p.sex || 'female')
  const [goal, setGoal] = useState(p.goal || 'hold')
  const [activity, setActivity] = useState(p.activity || 'light')

  const t = dayTargets(profile, weights)
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
            sex,
            activity,
            goal,
            age: +v.age,
            heightCm: r1(heightToCm(+v.height, units.height)),
            weightKg: r1(weightToKg(+v.weight, units.weight)),
            goalWeightKg: v.goalWeight ? r1(weightToKg(+v.goalWeight, units.weight)) : null,
          })
          setSaved(true)
        }}
      >
        <p className="muted" style={{ marginBottom: 16 }}>
          Set your body metrics and lifestyle to personalize your daily calories, protein, carbs, and fat targets.
        </p>

        {/* Biological Sex Selector */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Sex
          </span>
          <div className="segmented-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button
              type="button"
              className={`choice-tile ${sex === 'female' ? 'active' : ''}`}
              onClick={() => { setSex('female'); setSaved(false); }}
              style={{ alignItems: 'center', textAlign: 'center', padding: '12px 10px' }}
            >
              <span className="choice-tile-title">Female</span>
            </button>
            <button
              type="button"
              className={`choice-tile ${sex === 'male' ? 'active' : ''}`}
              onClick={() => { setSex('male'); setSaved(false); }}
              style={{ alignItems: 'center', textAlign: 'center', padding: '12px 10px' }}
            >
              <span className="choice-tile-title">Male</span>
            </button>
          </div>
        </div>

        {/* Fitness Goal Selector */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Goal
          </span>
          <div className="segmented-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {[
              ['lose', 'Lose Weight', 'Deficit'],
              ['hold', 'Maintain', 'Balanced'],
              ['gain', 'Gain Weight', 'Surplus'],
            ].map(([id, label, sub]) => (
              <button
                key={id}
                type="button"
                className={`choice-tile ${goal === id ? 'active' : ''}`}
                onClick={() => { setGoal(id); setSaved(false); }}
                style={{ alignItems: 'center', textAlign: 'center', padding: '12px 6px' }}
              >
                <span className="choice-tile-title" style={{ fontSize: 'var(--fs-subhead)' }}>{label}</span>
                <span className="choice-tile-desc" style={{ fontSize: '11px' }}>{sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Activity Level Selector */}
        <div style={{ marginBottom: 18 }}>
          <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Daily Activity
          </span>
          <div className="segmented-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {Object.keys(ACTIVITY).map((k) => (
              <button
                key={k}
                type="button"
                className={`choice-tile ${activity === k ? 'active' : ''}`}
                onClick={() => { setActivity(k); setSaved(false); }}
                style={{ padding: '10px 12px' }}
              >
                <span className="choice-tile-title" style={{ fontSize: 'var(--fs-subhead)' }}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </span>
                <span className="choice-tile-desc" style={{ fontSize: '11px' }}>
                  {k === 'sedentary' ? 'Desk, minimal walking' :
                   k === 'light' ? '1–3 workouts / week' :
                   k === 'moderate' ? '3–5 workouts / week' : '6–7 workouts / week'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Numeric Metrics */}
        <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
          Body Measurements
        </span>
        <div className="fields" style={{ marginBottom: 18 }}>
          <label>
            Age
            <input name="age" type="number" min="18" max="100" required defaultValue={p.age} placeholder="25" />
          </label>
          <label>
            Height ({units.height})
            <input name="height" type="number" step="0.1" min={units.height === 'in' ? 47 : 120} max={units.height === 'in' ? 91 : 230} required defaultValue={p.heightCm ? r1(heightFromCm(p.heightCm, units.height)) : ''} placeholder={`in ${units.height}`} />
          </label>
          <label>
            Weight ({units.weight})
            <input name="weight" type="number" min={wMin} max={wMax} step="0.1" required defaultValue={(p.weightKg || latestWeight(weights)) ? r1(weightFromKg(p.weightKg || latestWeight(weights), units.weight)) : ''} placeholder={`in ${units.weight}`} />
          </label>
          {modules.weight && (
            <label>
              Goal weight ({units.weight})
              <input name="goalWeight" type="number" min={wMin} max={wMax} step="0.1" defaultValue={(p.goalWeightKg || p.targetKg) ? r1(weightFromKg(p.goalWeightKg || p.targetKg, units.weight)) : ''} placeholder="Optional" />
            </label>
          )}
        </div>

        <button className="btn primary" style={{ width: '100%' }}>
          {saved ? 'Saved ✓' : 'Save Profile'}
        </button>
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

export const PALETTE = ['lime', 'sky', 'orange', 'violet', 'pink', 'red', 'teal', 'gold', 'white']
export const PALETTE_COLORS = {
  lime: '#30d158',
  sky: '#0a84ff',
  orange: '#ff9f0a',
  violet: '#bf5af2',
  pink: '#ff375f',
  red: '#ff453a',
  teal: '#40c8e0',
  gold: '#ffd60a',
  white: '#ffffff',
  green: '#30d158',
  blue: '#0a84ff',
  purple: '#bf5af2',
}

export function LookPage() {
  const { look } = useSettings()
  const set = (patch) => useStore.getState().setSettings('look', { ...look, ...patch })
  return (
    <section className="card">
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
          Theme
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            ['system', 'System', 'gear'],
            ['light', 'Light', 'sun'],
            ['dark', 'Dark', 'moon'],
          ].map(([val, label, icon]) => (
            <button
              key={val}
              type="button"
              className={`choice-tile ${look.theme === val ? 'active' : ''}`}
              style={{ alignItems: 'center', textAlign: 'center', padding: '12px 6px' }}
              onClick={() => set({ theme: val })}
            >
              <span className="choice-tile-icon"><Icon name={icon} /></span>
              <span className="choice-tile-title">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <span style={{ fontSize: 'var(--fs-footnote)', color: 'var(--label-2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
          Accent Colour
        </span>
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          {PALETTE.map((a) => {
            const isChecked = look.accent === a || (look.accent === 'green' && a === 'lime') || (look.accent === 'blue' && a === 'sky') || (look.accent === 'purple' && a === 'violet')
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={isChecked}
                aria-label={a}
                className={`swatch ${a}`}
                style={{ backgroundColor: PALETTE_COLORS[a] }}
                onClick={() => set({ accent: a })}
              >
                {isChecked && <Icon name="check" style={{ fontSize: 16, strokeWidth: 2.5 }} />}
              </button>
            )
          })}
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
      <p className="muted">Switch whole parts of openKCal off to keep it simple. Nothing is deleted: switch one back on and everything is where it was.</p>
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
        <strong>openKCal</strong> {import.meta.env.VITE_VERSION || 'v0.3.0'} — The open-source nutrition, calorie, and macro companion to openGym.
      </p>
      <p className="muted">{server ? `Connected to an openKCal server, version ${server.version}.` : 'Running locally in this browser (local-first).'}</p>
      <p className="muted">Install it: {install}.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
        <button
          type="button"
          className="btn sm tinted"
          onClick={() => {
            window.location.hash = '#welcome'
            window.dispatchEvent(new Event('popstate'))
          }}
        >
          Welcome Guide & Features
        </button>
        <a href="/download/openkcal.apk" download className="btn sm primary" style={{ textDecoration: 'none' }}>
          Download Android APK
        </a>
        {!isNativeApp() && (
          <button
            type="button"
            className="btn sm tinted"
            onClick={async () => {
              if (await newVersionReady()) location.reload()
              else useUI.getState().toast('You have the latest version')
            }}
          >
            Check for updates
          </button>
        )}
      </div>
      <h3>Food data</h3>
      <ul className="plain">
        <li>Indian Food Composition Tables 2017, National Institute of Nutrition (ICMR). Copyright NIN.</li>
        <li>USDA Food and Nutrient Database for Dietary Studies 2021–2023. Public domain.</li>
        <li>Open Food Facts, for barcodes. Open Database Licence.</li>
      </ul>
      <p className="muted">Designed in harmony with openGym by Duarte Santos.</p>
      <p className="muted">Targets and AI answers are estimates, not medical advice.</p>
    </section>
  )
}
