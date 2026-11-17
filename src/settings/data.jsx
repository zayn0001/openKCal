import { useState } from 'react'
import { diaryCsv, weightCsv } from '../lib/csv'
import { pick } from '../lib/state'
import { today, useStore } from '../store'
import { resetEverything, useSync } from '../sync'

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function importData(e, setNote) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file || !confirm('Importing replaces everything in openKCal (and on your account, if you are signed in). Continue?')) return
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    data = null
  }
  setNote(useStore.getState().importState(data) ? 'Imported.' : 'That file is not an openKCal backup.')
}

export function DataPage() {
  const user = useSync((s) => s.user)
  const [note, setNote] = useState('')
  const diary = useStore((s) => s.diary)
  const foods = useStore((s) => s.foods)
  const counts = { days: Object.values(diary).filter((d) => d.length).length, foods: foods.length }
  return (
    <>
      <section className="card">
        <h2>Back up</h2>
        <p className="muted">
          {user ? 'Your data is in this browser and on your server.' : 'Your data lives only in this browser.'} {counts.days} days logged,{' '}
          {counts.foods} foods and dishes of your own.
        </p>
        <div className="actions start">
          <button type="button" onClick={() => download(`openkcal-${today()}.json`, JSON.stringify(pick(useStore.getState())), 'application/json')}>
            Export backup (JSON)
          </button>
          <button type="button" className="ghost" onClick={() => download(`openkcal-diary-${today()}.csv`, diaryCsv(useStore.getState().diary), 'text/csv')}>
            Diary as spreadsheet (CSV)
          </button>
          <button type="button" className="ghost" onClick={() => download(`openkcal-weight-${today()}.csv`, weightCsv(useStore.getState().weights), 'text/csv')}>
            Weight as spreadsheet (CSV)
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Restore</h2>
        <p className="muted">Import a JSON backup made by openKCal. It replaces what is here now.</p>
        <div className="actions start">
          <button type="button" className="ghost" onClick={(e) => e.currentTarget.nextSibling.click()}>
            Import backup
          </button>
          <input type="file" accept="application/json,.json" hidden onChange={(e) => importData(e, setNote)} />
        </div>
        {note && (
          <p className="muted" role="status">
            {note}
          </p>
        )}
      </section>
      <section className="card danger-zone">
        <h2>Reset everything</h2>
        <p className="muted">
          Deletes your diary, foods, dishes, weigh-ins and settings{user ? ' here and on every device signed in to your account' : ' in this browser'}. Your
          account stays. Export a backup first if you might want it back.
        </p>
        <div className="actions start">
          <button
            type="button"
            className="danger"
            onClick={async () => {
              if (!confirm('Delete all your openKCal data? This cannot be undone.')) return
              try {
                await resetEverything()
                setNote('Everything was reset.')
              } catch (err) {
                setNote(err.message)
              }
            }}
          >
            Reset everything
          </button>
        </div>
      </section>
    </>
  )
}
