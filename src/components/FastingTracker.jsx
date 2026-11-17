import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useStore } from '../store'

const PROTOCOLS = {
  '16:8': { hours: 16, name: '16:8 LeanGains' },
  '14:10': { hours: 14, name: '14:10 Gentle' },
  '18:6': { hours: 18, name: '18:6 Intermediate' },
  '20:4': { hours: 20, name: '20:4 Warrior' },
}

function fastingStage(elapsedHours) {
  if (elapsedHours < 4) return { stage: 'Blood Sugar Stabilizing', color: 'var(--sky)' }
  if (elapsedHours < 12) return { stage: 'Glycogen Depletion', color: 'var(--teal)' }
  if (elapsedHours < 18) return { stage: 'Fat Burning Phase', color: 'var(--orange)' }
  if (elapsedHours < 24) return { stage: 'Ketosis & Ketones', color: 'var(--violet)' }
  return { stage: 'Autophagy & Cell Repair', color: 'var(--acc)' }
}

export default function FastingTracker() {
  const fasting = useStore((s) => s.fasting) || { startTime: null, protocol: '16:8' }
  const { setFasting } = useStore.getState()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const isRunning = !!fasting.startTime
  const targetHours = PROTOCOLS[fasting.protocol]?.hours || 16
  const targetMs = targetHours * 3600 * 1000
  const elapsedMs = isRunning ? Math.max(0, now - fasting.startTime) : 0
  const elapsedHours = elapsedMs / (3600 * 1000)
  const pct = Math.min(100, Math.round((elapsedMs / targetMs) * 100))

  const hours = Math.floor(elapsedHours)
  const mins = Math.floor((elapsedMs % (3600 * 1000)) / (60 * 1000))
  const secs = Math.floor((elapsedMs % (60 * 1000)) / 1000)

  const stage = fastingStage(elapsedHours)

  const startFast = (protocol = '16:8') => {
    setFasting({
      startTime: Date.now(),
      protocol,
    })
  }

  const endFast = () => {
    setFasting({
      startTime: null,
      protocol: fasting.protocol,
      lastEnded: Date.now(),
    })
  }

  return (
    <div className="card fast-card">
      <div className="card-head">
        <div className="card-head-main">
          <span className="card-head-g icon-tint-orange">
            <Icon name="timer" />
          </span>
          <div className="card-head-t">
            <span className="card-head-title">Intermittent Fasting</span>
            <span className="card-head-sub">{PROTOCOLS[fasting.protocol]?.name || '16:8 LeanGains'}</span>
          </div>
        </div>
        {isRunning ? (
          <button type="button" className="btn sm danger" onClick={endFast}>
            End Fast
          </button>
        ) : (
          <button type="button" className="btn sm primary" onClick={() => startFast(fasting.protocol)}>
            Start Fast
          </button>
        )}
      </div>

      {isRunning ? (
        <div className="fast-body">
          <div className="fast-timer-row">
            <div className="fast-clock">
              <span className="fast-clock-digits">
                {String(hours).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <span className="fast-clock-lbl">Elapsed of {targetHours}h Goal ({pct}%)</span>
            </div>
            <span className="fast-stage-pill" style={{ color: stage.color, borderColor: stage.color }}>
              <Icon name="flame" /> {stage.stage}
            </span>
          </div>

          <div className="fast-progress-track">
            <div
              className="fast-progress-bar"
              style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? 'var(--acc)' : 'var(--orange)' }}
            />
          </div>
        </div>
      ) : (
        <div className="fast-idle">
          <p className="fast-desc muted">
            Track your fasting window to boost fat burning, metabolic flexibility, and digestive recovery.
          </p>
          <div className="fast-protocol-pills">
            {Object.keys(PROTOCOLS).map((p) => (
              <button
                key={p}
                type="button"
                className={'chip' + (fasting.protocol === p ? ' on' : '')}
                onClick={() => setFasting({ ...fasting, protocol: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
