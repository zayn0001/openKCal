export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fibre']

const zero = () => Object.fromEntries(NUTRIENTS.map((k) => [k, 0]))

// Nutrients in `grams` of a food whose values are given per 100 g.
export const scale = (per100, grams) =>
  Object.fromEntries(NUTRIENTS.map((k) => [k, ((per100[k] || 0) * grams) / 100]))

// Total of anything carrying nutrient fields (diary entries, scaled foods).
export const sum = (items) =>
  items.reduce((t, i) => {
    for (const k of NUTRIENTS) t[k] += i[k] || 0
    return t
  }, zero())

// A recipe's per-100 g values from its ingredients: [{ per100, grams }].
export function recipePer100(ingredients) {
  const grams = ingredients.reduce((g, i) => g + i.grams, 0)
  if (!grams) return zero()
  return scale(sum(ingredients.map((i) => scale(i.per100, i.grams))), 10000 / grams)
}
