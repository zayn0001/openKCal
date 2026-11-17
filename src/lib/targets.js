export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }
export const GOAL = { lose: -500, hold: 0, gain: 300 }
const MIN_KCAL = 1200 // never suggest less than this, whatever the maths says

// Daily targets from a profile: Mifflin-St Jeor BMR x activity factor + goal offset.
// ponytail: fixed kcal offsets and 1.6 g/kg protein for everyone; make them
// profile settings when someone needs a different rate or a clinical diet.
export function targets(rawProfile = {}) {
  const p = rawProfile || {}
  const sex = p.sex === 'female' ? 'female' : 'male'
  const weightKg = Number(p.weightKg) > 0 ? Number(p.weightKg) : 70
  const heightCm = Number(p.heightCm) > 0 ? Number(p.heightCm) : (sex === 'female' ? 165 : 175)
  const age = Number(p.age) > 0 ? Number(p.age) : 28
  const activity = (p.activity && ACTIVITY[p.activity]) ? p.activity : 'moderate'
  const goal = (p.goal && GOAL[p.goal] !== undefined) ? p.goal : 'hold'

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
  const activityFactor = ACTIVITY[activity] ?? 1.55
  const goalOffset = GOAL[goal] ?? 0
  const rawKcal = Math.round(bmr * activityFactor + goalOffset)
  const kcal = Math.max(MIN_KCAL, Number.isFinite(rawKcal) ? rawKcal : 2000)
  const protein = Math.round(1.6 * weightKg)
  const fat = Math.round((kcal * 0.25) / 9)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, carbs, fat, fibre: Math.round((kcal / 1000) * 14) }
}

// Calories left today: the one formula the Diary ring and the coach both use.
export function remainingKcal(goal, eaten = {}, burned = 0) {
  const target = goal && Number.isFinite(goal.kcal) && goal.kcal > 0 ? Math.round(goal.kcal) : 2000
  return { target, remaining: target - Math.round(Number(eaten?.kcal) || 0) + Math.round(Number(burned) || 0) }
}
