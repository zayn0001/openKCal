// Spreadsheet export (CSV), as openGym offers next to the JSON backup.
import { EXTRAS, NUTRIENTS } from './nutrition.js'

// Quotes a cell when it needs it; a leading = + - @ is defused so a spreadsheet won't run it.
export function cell(v) {
  if (v == null) return ''
  let s = typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v)
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

const COLS = [...NUTRIENTS, ...EXTRAS]
const HEAD = { kcal: 'Energy (kcal)', protein: 'Protein (g)', carbs: 'Carbs (g)', fat: 'Fat (g)', fibre: 'Fibre (g)', sugar: 'Sugars (g)', satFat: 'Saturated fat (g)', sodium: 'Sodium (mg)' }

export function diaryCsv(diary) {
  const rows = [['Date', 'Meal', 'Food', 'Grams', ...COLS.map((k) => HEAD[k])]]
  for (const date of Object.keys(diary).sort())
    for (const e of diary[date]) rows.push([date, e.meal, e.name, e.grams, ...COLS.map((k) => e[k])])
  return toCsv(rows)
}

export function weightCsv(weights) {
  return toCsv([['Date', 'Weight (kg)'], ...Object.keys(weights).sort().map((d) => [d, weights[d]])])
}
