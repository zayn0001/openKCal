// Display units. Everything is stored metric (kcal, kg, cm); only what is shown and typed changes.
export const KJ_PER_KCAL = 4.184
const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54

export const energy = (kcal, unit) => (unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal)
export const fmtEnergy = (kcal, unit = 'kcal') => `${Math.round(energy(kcal, unit))} ${unit === 'kJ' ? 'kJ' : 'kcal'}`

export const weightFromKg = (kg, unit) => (unit === 'lb' ? kg * LB_PER_KG : kg)
export const weightToKg = (v, unit) => (unit === 'lb' ? v / LB_PER_KG : v)
export const fmtWeight = (kg, unit = 'kg') => `${Math.round(weightFromKg(kg, unit) * 10) / 10} ${unit === 'lb' ? 'lb' : 'kg'}`

export const heightFromCm = (cm, unit) => (unit === 'in' ? cm / CM_PER_IN : cm)
export const heightToCm = (v, unit) => (unit === 'in' ? v * CM_PER_IN : v)

/** A nutrient amount with its unit, rounded the way food labels round. */
export function fmtAmount(v, unit) {
  if (v == null || !Number.isFinite(v)) return '—'
  if (unit === 'mg') return `${Math.round(v)} mg`
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} g`
}
