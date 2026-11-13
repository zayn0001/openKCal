export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 }
export const GOAL = { lose: -500, hold: 0, gain: 300 }
const MIN_KCAL = 1200 // never suggest less than this, whatever the maths says

// Daily targets from a profile: Mifflin-St Jeor BMR x activity factor + goal offset.
// ponytail: fixed kcal offsets and 1.6 g/kg protein for everyone; make them
// profile settings when someone needs a different rate or a clinical diet.
export function targets({ sex, age, heightCm, weightKg, activity, goal }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
  const kcal = Math.max(MIN_KCAL, Math.round(bmr * ACTIVITY[activity] + GOAL[goal]))
  const protein = Math.round(1.6 * weightKg)
  const fat = Math.round((kcal * 0.25) / 9)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, carbs, fat, fibre: Math.round((kcal / 1000) * 14) }
}
