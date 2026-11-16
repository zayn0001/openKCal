// The five nutrients every food has, and three that only some sources give (FNDDS and Open Food
// Facts do; IFCT 2017's Table 1 does not). Values are per 100 g; sodium is in mg, the rest in g.
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fibre']
export const EXTRAS = ['sugar', 'satFat', 'sodium']

export const INFO = {
  kcal: { label: 'Energy', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Carbohydrate', unit: 'g' },
  sugar: { label: 'of which sugars', unit: 'g', sub: true },
  fat: { label: 'Fat', unit: 'g' },
  satFat: { label: 'of which saturated', unit: 'g', sub: true },
  fibre: { label: 'Fibre', unit: 'g' },
  sodium: { label: 'Sodium', unit: 'mg' },
}
// Label order, as on a food label.
export const LABEL_ORDER = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'satFat', 'fibre', 'sodium']

const known = (v) => typeof v === 'number' && Number.isFinite(v)

/** Nutrients in `grams` of a food whose values are per 100 g. An unknown extra stays unknown. */
export function scale(per100, grams) {
  const out = {}
  for (const k of NUTRIENTS) out[k] = ((per100[k] || 0) * grams) / 100
  for (const k of EXTRAS) if (known(per100[k])) out[k] = (per100[k] * grams) / 100
  return out
}

/**
 * Total of anything carrying nutrient fields (diary entries, scaled foods). An extra is summed
 * over the items that have it; `known` says how many did, so a partial total can be shown as one.
 */
export function sum(items) {
  const t = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]))
  const counts = {}
  for (const i of items) {
    for (const k of NUTRIENTS) t[k] += i[k] || 0
    for (const k of EXTRAS)
      if (known(i[k])) {
        t[k] = (t[k] || 0) + i[k]
        counts[k] = (counts[k] || 0) + 1
      }
  }
  Object.defineProperty(t, 'known', { value: { count: items.length, ...counts }, enumerable: false })
  return t
}

/** Per-100 g values of a logged entry, which stores totals for its grams. */
export const per100Of = (entry) => {
  const g = entry.grams || 0
  const out = {}
  for (const k of [...NUTRIENTS, ...EXTRAS]) if (known(entry[k])) out[k] = g ? (entry[k] * 100) / g : 0
  return out
}

/** Share of energy from protein, carbs and fat, in whole percent (4, 4 and 9 kcal per gram). */
export function macroSplit(n) {
  const p = (n.protein || 0) * 4
  const c = (n.carbs || 0) * 4
  const f = (n.fat || 0) * 9
  const total = p + c + f
  if (!total) return { protein: 0, carbs: 0, fat: 0 }
  const protein = Math.round((p / total) * 100)
  const fat = Math.round((f / total) * 100)
  return { protein, carbs: 100 - protein - fat, fat }
}

// Kept for older callers: a recipe of { per100, grams } with no cooked weight.
export const recipePer100 = (ingredients) => {
  const grams = ingredients.reduce((g, i) => g + i.grams, 0)
  if (!grams) return Object.fromEntries(NUTRIENTS.map((k) => [k, 0]))
  return scale(sum(ingredients.map((i) => scale(i.per100, i.grams))), 10000 / grams)
}
