import { sum } from './nutrition.js'

// YYYY-MM-DD shifted by whole days, independent of the device time zone.
export function shiftDate(date, days) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The seven days ending on `end`, as the compact summary the weekly review reads.
export function weekSummary({ diary, weights }, goal, end) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const date = shiftDate(end, -i)
    const entries = diary[date] || []
    const totals = Object.fromEntries(Object.entries(sum(entries)).map(([k, v]) => [k, Math.round(v)]))
    days.push({ date, logged: entries.length > 0, ...totals })
  }
  const weighed = Object.keys(weights)
    .filter((d) => d >= days[0].date && d <= end)
    .sort()
  return {
    targets: goal || null,
    days,
    weightKg: weighed.length ? { start: weights[weighed[0]], end: weights[weighed.at(-1)] } : null,
  }
}
