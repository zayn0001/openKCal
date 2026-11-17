// openGym integration engine for openKCal.
// Reads, converts, and syncs workouts, body weight, and measurements from openGym
// either directly from local browser storage (gym_state_v1) or from exported JSON/CSV backups.

export const OPENGYM_STORAGE_KEY = 'gym_state_v1'

/**
 * Standard MET values (Compendium of Physical Activities)
 */
const MET_RESISTANCE = 5.5
const MET_VIGOROUS_CARDIO = 7.5

/**
 * Calculate calories burned for a workout duration given user weight in kg.
 * Formula: Calories = (durationMinutes * MET * 3.5 * weightKg) / 200
 */
export function estimateWorkoutCalories(durationMin, weightKg = 70, isCardio = false) {
  const met = isCardio ? MET_VIGOROUS_CARDIO : MET_RESISTANCE
  const min = Math.max(5, Number(durationMin) || 45)
  const kg = Math.max(30, Number(weightKg) || 70)
  return Math.round((min * met * 3.5 * kg) / 200)
}

/**
 * Check if openGym data exists in local browser storage.
 */
export function detectOpenGym() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { detected: false }
  }
  try {
    const raw = window.localStorage.getItem(OPENGYM_STORAGE_KEY)
    if (!raw) return { detected: false }
    const state = JSON.parse(raw)
    if (!state || typeof state !== 'object') return { detected: false }

    const workouts = Array.isArray(state.workouts) ? state.workouts : []
    const bodyweight = Array.isArray(state.bodyweight) ? state.bodyweight : []
    const measurements = Array.isArray(state.measurements) ? state.measurements : []

    const latestWorkout = workouts.length
      ? [...workouts].sort((a, b) => (b.d || '').localeCompare(a.d || ''))[0]
      : null
    const latestWeight = bodyweight.length
      ? [...bodyweight].sort((a, b) => (b.d || '').localeCompare(a.d || ''))[0]
      : null

    return {
      detected: true,
      workoutsCount: workouts.length,
      weightsCount: bodyweight.length,
      measurementsCount: measurements.length,
      unit: state.unit || 'kg',
      targetW: state.targetW || null,
      latestWorkout: latestWorkout ? { date: latestWorkout.d, name: latestWorkout.name } : null,
      latestWeight: latestWeight ? { date: latestWeight.d, weight: latestWeight.w } : null,
      raw: state,
    }
  } catch {
    return { detected: false }
  }
}

/**
 * Convert openGym workouts array into openKCal daily exercises map.
 * @param {Array} workouts - openGym S.workouts
 * @param {number} userWeightKg - current user weight for MET calorie formula
 * @returns {Record<string, Array>} { [isoDate]: [exercises] }
 */
export function convertOpenGymWorkouts(workouts = [], userWeightKg = 70) {
  const result = {}
  if (!Array.isArray(workouts)) return result

  for (const w of workouts) {
    if (!w || !w.d) continue
    const date = w.d

    // Calculate duration in minutes
    let durationMin = 45
    if (Number(w.end) > 0 && Number(w.start) > 0 && w.end > w.start) {
      durationMin = Math.max(5, Math.round((w.end - w.start) / 60000))
    }

    // Inspect entries/exercises
    const entries = Array.isArray(w.entries) ? w.entries : []
    const totalSets = entries.reduce((acc, e) => acc + (Array.isArray(e.sets) ? e.sets.length : 0), 0)
    const exerciseNames = entries
      .map((e) => e.name || e.id || '')
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')

    const isCardio = (w.name || '').toLowerCase().includes('cardio') || (w.name || '').toLowerCase().includes('run')
    const caloriesBurned = estimateWorkoutCalories(durationMin, userWeightKg, isCardio)

    const exercise = {
      id: `opengym_${w.id || `${date}_${w.start || Math.random().toString(36).slice(2, 7)}`}`,
      name: w.name || 'Strength Workout',
      durationMin,
      caloriesBurned,
      type: isCardio ? 'cardio' : 'gym',
      source: 'openGym',
      details: exerciseNames ? `${totalSets ? `${totalSets} sets · ` : ''}${exerciseNames}` : `${totalSets} sets`,
      at: w.start || null,
    }

    if (!result[date]) result[date] = []
    result[date].push(exercise)
  }

  return result
}

/**
 * Convert openGym bodyweight array into openKCal weights dictionary { [isoDate]: kg }
 */
export function convertOpenGymWeights(bodyweight = [], openGymUnit = 'kg') {
  const weights = {}
  if (!Array.isArray(bodyweight)) return weights

  const isLb = openGymUnit === 'lb'

  for (const b of bodyweight) {
    if (!b || !b.d || !(Number(b.w) > 0)) continue
    const rawVal = Number(b.w)
    const kg = isLb ? rawVal * 0.45359237 : rawVal
    weights[b.d] = Math.round(kg * 10) / 10
  }

  return weights
}

/**
 * Convert openGym body measurements into openKCal measurements dictionary
 */
export function convertOpenGymMeasurements(measurements = []) {
  const result = {}
  if (!Array.isArray(measurements)) return result

  for (const m of measurements) {
    if (!m || !m.d) continue
    result[m.d] = {
      waist: Number(m.waist) > 0 ? Number(m.waist) : undefined,
      hips: Number(m.hips) > 0 ? Number(m.hips) : undefined,
      chest: Number(m.chest) > 0 ? Number(m.chest) : undefined,
      arms: Number(m.bicep || m.arm || m.arms) > 0 ? Number(m.bicep || m.arm || m.arms) : undefined,
      bodyFat: Number(m.bf || m.bodyFat || m.body_fat) > 0 ? Number(m.bf || m.bodyFat || m.body_fat) : undefined,
    }
  }

  return result
}

/**
 * Parse an openGym CSV export text (Workouts CSV or Body CSV).
 */
export function parseOpenGymCsv(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) return null
  const lines = csvText
    .replace(/^\uFEFF/, '') // Strip UTF-8 BOM
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return null

  // Helper to split CSV row taking quotes into account
  const splitRow = (line) => {
    const cells = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur.trim())
    return cells
  }

  const header = splitRow(lines[0]).map((h) => h.toLowerCase())

  // Check if it's openGym workouts CSV
  if (header.includes('workout') || header.includes('exercise') || header.includes('exercise_id')) {
    const dateIdx = header.indexOf('date')
    const workoutIdx = header.indexOf('workout')
    const exIdx = header.indexOf('exercise')
    const setIdx = header.indexOf('set')
    const secIdx = header.indexOf('seconds')

    const workoutsMap = new Map()

    for (let i = 1; i < lines.length; i++) {
      const row = splitRow(lines[i])
      const date = row[dateIdx]
      if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue

      const workoutName = (workoutIdx !== -1 ? row[workoutIdx] : 'Workout') || 'Workout'
      const key = `${date}_${workoutName}`

      if (!workoutsMap.has(key)) {
        workoutsMap.set(key, {
          d: date,
          name: workoutName,
          entries: [],
          totalSec: 0,
        })
      }

      const item = workoutsMap.get(key)
      const exName = exIdx !== -1 ? row[exIdx] : ''
      if (exName && !item.entries.find((e) => e.name === exName)) {
        item.entries.push({ name: exName, sets: [] })
      }
      const exEntry = item.entries.find((e) => e.name === exName)
      if (exEntry) {
        exEntry.sets.push({ set: setIdx !== -1 ? row[setIdx] : 1 })
      }
      if (secIdx !== -1 && Number(row[secIdx]) > 0) {
        item.totalSec += Number(row[secIdx])
      }
    }

    const workouts = [...workoutsMap.values()].map((w) => {
      const durationMin = w.totalSec > 0 ? Math.max(10, Math.round(w.totalSec / 60)) : 45
      return {
        ...w,
        start: new Date(`${w.d}T10:00:00`).getTime(),
        end: new Date(`${w.d}T10:00:00`).getTime() + durationMin * 60000,
      }
    })

    return { type: 'workouts_csv', workouts }
  }

  // Check if it's openGym body CSV (weight & measurements)
  if (header.includes('weight') || header.includes('waist') || header.includes('chest')) {
    const dateIdx = header.indexOf('date')
    const weightIdx = header.indexOf('weight')
    const waistIdx = header.indexOf('waist')
    const hipsIdx = header.indexOf('hips')
    const chestIdx = header.indexOf('chest')
    const bfIdx = header.findIndex((h) => h === 'body_fat' || h === 'bf' || h === 'bodyfat')
    const armIdx = header.findIndex((h) => h === 'bicep' || h === 'arm' || h === 'arms')

    const bodyweight = []
    const measurements = []

    for (let i = 1; i < lines.length; i++) {
      const row = splitRow(lines[i])
      const date = row[dateIdx]
      if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue

      if (weightIdx !== -1 && Number(row[weightIdx]) > 0) {
        bodyweight.push({ d: date, w: Number(row[weightIdx]) })
      }

      const m = { d: date }
      let hasM = false
      if (waIdx(waistIdx, row)) {
        m.waist = Number(row[waistIdx])
        hasM = true
      }
      if (waIdx(hipsIdx, row)) {
        m.hips = Number(row[hipsIdx])
        hasM = true
      }
      if (waIdx(chestIdx, row)) {
        m.chest = Number(row[chestIdx])
        hasM = true
      }
      if (waIdx(bfIdx, row)) {
        m.bf = Number(row[bfIdx])
        hasM = true
      }
      if (waIdx(armIdx, row)) {
        m.bicep = Number(row[armIdx])
        hasM = true
      }

      if (hasM) measurements.push(m)
    }

    return { type: 'body_csv', bodyweight, measurements }
  }

  return null
}

const waIdx = (idx, row) => idx !== -1 && Number(row[idx]) > 0

/**
 * Universal parser for any openGym backup (JSON object, JSON string, or CSV).
 */
export function parseOpenGymBackup(content) {
  if (!content) return null

  // If already an object
  if (typeof content === 'object') {
    return content
  }

  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed)
      } catch {
        return null
      }
    }
    // Attempt CSV parse
    return parseOpenGymCsv(trimmed)
  }

  return null
}

/**
 * Merge openGym state into openKCal store.
 * @param {object} openGymState - raw or parsed openGym state
 * @param {object} store - Zustand useStore or store methods
 * @returns {object} Sync result statistics
 */
export function syncOpenGymData(openGymState, store) {
  if (!openGymState || !store) return { success: false, error: 'No data or store' }

  const state = openGymState.raw || openGymState
  const currentWeights = store.weights || {}
  const latestKg = Object.keys(currentWeights).sort().at(-1)
    ? currentWeights[Object.keys(currentWeights).sort().at(-1)]
    : store.profile?.weightKg || 70

  const unit = state.unit || 'kg'
  const newWeights = convertOpenGymWeights(state.bodyweight || [], unit)
  const newExercises = convertOpenGymWorkouts(state.workouts || [], latestKg)
  const newMeasurements = convertOpenGymMeasurements(state.measurements || [])

  let workoutsAdded = 0
  let weightsAdded = 0
  let measurementsAdded = 0

  // Merge weights
  const updatedWeights = { ...(store.weights || {}) }
  for (const [date, val] of Object.entries(newWeights)) {
    if (!updatedWeights[date] || Math.abs(updatedWeights[date] - val) > 0.01) {
      updatedWeights[date] = val
      weightsAdded++
    }
  }

  // Merge exercises without duplicates
  const updatedExercises = { ...(store.exercises || {}) }
  for (const [date, exList] of Object.entries(newExercises)) {
    const existing = updatedExercises[date] || []
    const existingIds = new Set(existing.map((e) => e.id))
    const toAdd = exList.filter((e) => !existingIds.has(e.id))
    if (toAdd.length > 0) {
      updatedExercises[date] = [...existing, ...toAdd]
      workoutsAdded += toAdd.length
    }
  }

  // Merge measurements
  const updatedMeasurements = { ...(store.measurements || {}) }
  for (const [date, m] of Object.entries(newMeasurements)) {
    updatedMeasurements[date] = { ...(updatedMeasurements[date] || {}), ...m }
    measurementsAdded++
  }

  // Target weight & body sex
  let updatedProfile = store.profile ? { ...store.profile } : null
  if (state.targetW && Number(state.targetW) > 0) {
    if (!updatedProfile) updatedProfile = {}
    updatedProfile.targetKg = Number(state.targetW)
  }
  if (state.body && (state.body === 'male' || state.body === 'female')) {
    if (!updatedProfile) updatedProfile = {}
    updatedProfile.sex = state.body
  }

  // Update store in one state transition
  store.setOpenGymSync({
    weights: updatedWeights,
    exercises: updatedExercises,
    measurements: updatedMeasurements,
    profile: updatedProfile,
    syncStats: {
      lastSync: Date.now(),
      workoutsCount: Object.values(updatedExercises).flat().filter((e) => e.source === 'openGym').length,
      weightsCount: Object.keys(updatedWeights).length,
    },
  })

  return {
    success: true,
    workoutsAdded,
    weightsAdded,
    measurementsAdded,
    totalWorkouts: (state.workouts || []).length,
    totalWeights: (state.bodyweight || []).length,
  }
}

// ---- openGym Remote Server & Token Integration ----

/**
 * Normalizes a server URL string (handles missing scheme, trailing slashes, whitespace).
 */
export function normalizeServerUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'http://' + s
  try {
    const u = new URL(withScheme)
    if (!u.hostname) return null
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/**
 * Redeem an openGym 6-character pairing code for a persistent Bearer token.
 * Matches openGym /api/pair/redeem specification.
 */
export async function redeemPairingCode(rawUrl, code) {
  const base = normalizeServerUrl(rawUrl)
  if (!base) throw new Error('Enter a valid openGym server address')
  const trimmedCode = String(code || '').trim().toUpperCase()
  if (!trimmedCode) throw new Error('Enter a pairing code')

  const res = await fetch(`${base}/api/pair/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: trimmedCode }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.token) {
    throw new Error(body?.error || body?.code || `Pairing failed: HTTP ${res.status}`)
  }

  return {
    serverUrl: base,
    token: body.token,
    user: body.user || null,
  }
}

/**
 * Verify a direct openGym API / Bearer token by checking /api/data/rev.
 */
export async function verifyOpenGymToken(rawUrl, token) {
  const base = normalizeServerUrl(rawUrl)
  if (!base) throw new Error('Enter a valid openGym server address')
  const t = String(token || '').trim()
  if (!t) throw new Error('Enter a token')

  const res = await fetch(`${base}/api/data/rev`, {
    headers: { Authorization: `Bearer ${t}` },
  })

  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Unauthorized: Token is invalid or expired' : `Token check failed: HTTP ${res.status}`)
  }

  const body = await res.json().catch(() => ({}))
  return {
    valid: true,
    serverUrl: base,
    token: t,
    rev: body.rev || null,
  }
}

/**
 * Checks the revision of the remote openGym instance without downloading full data.
 */
export async function checkRemoteRevision(serverUrl, token) {
  try {
    const res = await fetch(`${serverUrl}/api/data/rev`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return data?.rev || null
  } catch {
    return null
  }
}

/**
 * Downloads the full user state from openGym server.
 */
export async function fetchRemoteState(serverUrl, token) {
  const res = await fetch(`${serverUrl}/api/data`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch openGym data: HTTP ${res.status}`)
  return await res.json()
}

/**
 * Syncs with the configured remote openGym server.
 * Uses revision checking to only fetch the full payload when changes have occurred.
 */
export async function syncRemoteOpenGym(store, forced = false) {
  const remote = store.openGymRemote
  if (!remote?.connected || !remote?.serverUrl || !remote?.token) {
    return { success: false, reason: 'not-connected' }
  }

  try {
    const latestRev = await checkRemoteRevision(remote.serverUrl, remote.token)
    if (!forced && latestRev && remote.lastRev && latestRev === remote.lastRev) {
      return { success: true, updated: false, rev: latestRev }
    }

    const remoteData = await fetchRemoteState(remote.serverUrl, remote.token)
    const stats = syncOpenGymData(remoteData, store)

    store.setOpenGymRemote({
      lastRev: latestRev || Date.now().toString(),
      lastSync: Date.now(),
    })

    return {
      success: true,
      updated: true,
      rev: latestRev,
      stats,
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

