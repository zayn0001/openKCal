import { useState } from 'react'
import Icon from './Icon'
import { useStore } from '../store'
import { useUI } from '../store/useUI'
import { detectOpenGym, syncOpenGymData, syncRemoteOpenGym } from '../lib/opengym'

export const EXERCISE_TYPES = [
  { id: 'walk', name: 'Brisk Walking', met: 4.0, icon: 'figureRun' },
  { id: 'run', name: 'Running / Jogging', met: 9.8, icon: 'figureRun' },
  { id: 'gym', name: 'Gym / Strength', met: 5.0, icon: 'dumbbell' },
  { id: 'hiit', name: 'HIIT / Circuit', met: 8.0, icon: 'flame' },
  { id: 'cycle', name: 'Cycling', met: 7.0, icon: 'flame' },
  { id: 'yoga', name: 'Yoga / Mobility', met: 3.0, icon: 'heart' },
]

function ExerciseModalForm({ date, weightKg, onClose }) {
  const [typeId, setTypeId] = useState(EXERCISE_TYPES[0].id)
  const [minutes, setMinutes] = useState(30)
  const selectedType = EXERCISE_TYPES.find((x) => x.id === typeId) || EXERCISE_TYPES[0]
  const [kcal, setKcal] = useState(Math.round(selectedType.met * weightKg * (30 / 60)))
  const { addExercise } = useStore.getState()

  const handleSelectType = (t) => {
    setTypeId(t.id)
    setKcal(Math.round(t.met * weightKg * (minutes / 60)))
  }

  const handleMinutesChange = (m) => {
    const minVal = +m || 0
    setMinutes(minVal)
    setKcal(Math.round(selectedType.met * weightKg * (minVal / 60)))
  }

  return (
    <form
      className="exercise-form"
      onSubmit={(e) => {
        e.preventDefault()
        addExercise(date, {
          id: crypto.randomUUID(),
          name: selectedType.name,
          type: selectedType.id,
          minutes: +minutes,
          kcal: +kcal,
        })
        onClose()
      }}
    >
      <h3>Log Workout & Activity</h3>

      <div className="sect-b">
        <div className="lrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '12px 14px' }}>
          <span className="lrow-t" style={{ fontSize: 'var(--fs-caption)', color: 'var(--label-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Select Activity
          </span>
          <div className="chips" style={{ margin: 0, padding: 0 }}>
            {EXERCISE_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`chip ${typeId === t.id ? 'on' : ''}`}
                onClick={() => handleSelectType(t)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Icon name={t.icon} /> {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Duration</span>
            <span className="lrow-s">Minutes active</span>
          </span>
          <input
            type="number"
            min="1"
            max="300"
            value={minutes}
            className="num"
            style={{ width: '80px', textAlign: 'right' }}
            onChange={(e) => handleMinutesChange(e.target.value)}
          />
        </div>

        <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">Calories Burned</span>
            <span className="lrow-s">Estimated kcal</span>
          </span>
          <input
            type="number"
            min="1"
            value={kcal}
            className="num"
            style={{ width: '80px', textAlign: 'right' }}
            onChange={(e) => setKcal(+e.target.value || 0)}
          />
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <button className="btn primary" type="submit">
          Log Exercise
        </button>
      </div>
    </form>
  )
}

export default function ExerciseTracker({ date }) {
  const exercises = useStore((s) => s.exercises?.[date]) || []
  const weightKg = useStore((s) => s.profile?.weightKg) || 70
  const { removeExercise } = useStore.getState()
  const { openSheet, toast } = useUI.getState()

  const totalBurned = exercises.reduce((acc, x) => acc + (x.kcal || x.caloriesBurned || 0), 0)

  const handleQuickSyncOpenGym = async () => {
    const store = useStore.getState()
    if (store.openGymRemote?.connected) {
      const res = await syncRemoteOpenGym(store, true)
      if (res.success) {
        if (res.updated) {
          toast(`Synced from openGym: ${res.stats?.workoutsAdded || 0} new workouts.`)
        } else {
          toast('openGym is already up to date.')
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
      toast(`Synced from openGym: ${res.workoutsAdded} new workouts.`)
    }
  }

  const openLogSheet = () => {
    openSheet((close) => <ExerciseModalForm date={date} weightKg={weightKg} onClose={close} />)
  }

  return (
    <div className="card ex-card">
      <div className="card-head">
        <div className="card-head-main">
          <span className="card-head-g icon-tint-orange">
            <Icon name="dumbbell" />
          </span>
          <div className="card-head-t">
            <span className="card-head-title">Exercise & Burned Calories</span>
            <span className="card-head-sub">{totalBurned} kcal burned today</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="iconbtn on-ss"
            onClick={handleQuickSyncOpenGym}
            title="Sync latest workouts from openGym"
            aria-label="Sync openGym"
          >
            <Icon name="arrowClockwise" size={16} />
          </button>
          <button type="button" className="iconbtn on-ss" onClick={openLogSheet} aria-label="Add workout">
            <Icon name="plus" />
          </button>
        </div>
      </div>

      {exercises.length > 0 ? (
        <div className="ex-list">
          {exercises.map((x) => (
            <div key={x.id} className="lrow">
              <span className="lrow-i" style={{ '--tint': x.source === 'openGym' ? 'var(--lime)' : 'var(--orange)' }}>
                <Icon name={x.type === 'gym' ? 'dumbbell' : 'figureRun'} />
              </span>
              <span className="lrow-m">
                <span className="lrow-t" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {x.name}
                  {x.source === 'openGym' && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        backgroundColor: 'var(--lime)',
                        color: '#000',
                        fontWeight: 700,
                        borderRadius: 4,
                      }}
                    >
                      openGym
                    </span>
                  )}
                </span>
                <span className="lrow-s">{x.minutes || x.durationMin} mins{x.details ? ` · ${x.details}` : ''}</span>
              </span>
              <span className="lrow-v font-orange">−{x.kcal || x.caloriesBurned} kcal</span>
              <button
                type="button"
                className="iconbtn"
                style={{ width: 28, height: 28, fontSize: 13 }}
                onClick={() => removeExercise(date, x.id)}
                aria-label={`Delete ${x.name}`}
              >
                <Icon name="xmark" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="ex-empty muted">
          No workouts logged yet. Tap + to record workouts, or sync workouts from openGym.
        </p>
      )}
    </div>
  )
}
