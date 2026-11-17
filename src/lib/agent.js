// "Tell openKCal what you ate": the meal agent's tools, instructions, and the check that turns
// whatever the model proposes into something safe to show. The agent only ever proposes: the
// person reviews every entry and every new dish, and nothing is saved until they confirm.
import { buildDish } from './dish.js'
import { searchFoods } from './search.js'
import { MEALS } from './settings.js'

export const TOOLS = [
  {
    name: 'search_foods',
    description:
      "Search the person's own foods and dishes and the food catalogue (Indian raw foods from IFCT 2017, cooked dishes from USDA FNDDS). Returns up to 8 matches with their id, nutrients per 100 g and household portions. Search for each thing the person ate, with short plain words ('dal', 'roti', 'chicken curry'), before proposing it.",
    schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A few words naming one food' } },
      required: ['query'],
    },
  },
  {
    name: 'propose_meal',
    description:
      'Propose the diary entries for what the person described, and any new dishes to create in their list. Call this once, at the end. The person reviews and confirms everything; nothing is saved until they do.',
    schema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          description: 'One per thing eaten',
          items: {
            type: 'object',
            properties: {
              food_id: { type: 'string', description: 'An id from search_foods, or the temp_id of a new dish below' },
              grams: { type: 'number', description: 'How much was eaten, in grams' },
              meal: { type: 'string', enum: MEALS },
            },
            required: ['food_id', 'grams', 'meal'],
          },
        },
        new_dishes: {
          type: 'array',
          description: "Home-made dishes that are not in the person's own list, built from catalogue ingredients for ONE serving as eaten",
          items: {
            type: 'object',
            properties: {
              temp_id: { type: 'string', description: 'Your own id, like new-1, to use as food_id in entries' },
              name: { type: 'string' },
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { food_id: { type: 'string' }, grams: { type: 'number', description: 'Raw weight for one serving' } },
                  required: ['food_id', 'grams'],
                },
              },
            },
            required: ['temp_id', 'name', 'ingredients'],
          },
        },
        message: { type: 'string', description: 'One or two short sentences to the person: assumptions made, or a question if something was unclear' },
      },
      required: ['entries'],
    },
  },
]

export function agentSystem({ time, meal }) {
  return `You log meals into a food diary from what a person tells you they ate. It is ${time} where they are${meal ? ` and they are adding to ${meal}` : ''}.
Use search_foods to find each food. Prefer the person's own foods and dishes (source "mine" or "dish") when they match. Indian home cooking is common: roti, dal, sabzi, rice, curd.
Estimate grams from what they said (1 roti is about 40 g, a katori of dal about 150 g, a cup of cooked rice about 160 g) and use a food's portions when given. Pick the meal from what they said, else from the time of day.
When they ate a home-made dish that is not in their own list and the catalogue has no close match, add it to new_dishes, built from catalogue ingredients for one serving, and log it by its temp_id with the grams of that one serving (the sum of its ingredients).
Finish by calling propose_meal exactly once. Keep message short. If you cannot tell what they ate, call propose_meal with no entries and ask in message.`
}

const round1 = (n) => Math.round(n * 10) / 10

/** What search_foods hands back to the model: compact, nothing it doesn't need. */
export function searchResults(foods, query) {
  return searchFoods(foods, String(query || '').slice(0, 80), 8).map((f) => ({
    id: f.id,
    name: f.name,
    source: f.kind === 'dish' ? 'dish' : f.source && f.source !== 'OFF' ? f.source : 'mine',
    per_100g: { kcal: Math.round(f.per100.kcal), protein: round1(f.per100.protein), carbs: round1(f.per100.carbs), fat: round1(f.per100.fat) },
    portions: f.portions.slice(0, 3),
  }))
}

const mealFor = (time) => {
  const h = Number(String(time).slice(0, 2))
  return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 19 ? 'Snack' : 'Dinner'
}

/**
 * The model's propose_meal input, checked against real foods: unknown ids and nonsense amounts
 * are dropped, names come from the foods themselves, and new dishes get their nutrients worked
 * out here rather than taken from the model. `find(id)` returns a food or undefined.
 * Returns { entries: [{ food, grams, meal, newDish? }], dishes: [{ tempId, name, ingredients, per100 }], message, dropped }.
 */
export function resolveProposal(raw, find, { time = '12:00', meal } = {}) {
  let dropped = 0
  const dishes = []
  for (const d of (Array.isArray(raw?.new_dishes) ? raw.new_dishes : []).slice(0, 6)) {
    const ingredients = []
    for (const i of Array.isArray(d?.ingredients) ? d.ingredients.slice(0, 20) : []) {
      const food = find(String(i?.food_id))
      const grams = Number(i?.grams)
      if (food && grams > 0 && grams <= 3000) ingredients.push({ name: food.name, grams: round1(grams), per100: food.per100, foodId: food.id, ...(food.source && { source: food.source }) })
      else dropped++
    }
    const name = String(d?.name || '').trim().slice(0, 80)
    if (!name || !ingredients.length || !d?.temp_id) {
      dropped++
      continue
    }
    const dish = buildDish({ name, ingredients, servings: 1 })
    dishes.push({ tempId: String(d.temp_id), name, ingredients, per100: dish.per100, grams: dish.rawGrams })
  }
  const entries = []
  for (const e of (Array.isArray(raw?.entries) ? raw.entries : []).slice(0, 20)) {
    const id = String(e?.food_id)
    const draft = dishes.find((d) => d.tempId === id)
    const food = draft ? { id, name: draft.name, per100: draft.per100, kind: 'dish', portions: [] } : find(id)
    let grams = Number(e?.grams)
    if (draft && !(grams > 0)) grams = draft.grams
    if (!food || !(grams > 0) || grams > 3000) {
      dropped++
      continue
    }
    entries.push({ food, grams: round1(grams), meal: MEALS.includes(e?.meal) ? e.meal : meal || mealFor(time), ...(draft && { newDish: id }) })
  }
  const message = typeof raw?.message === 'string' ? raw.message.trim().slice(0, 400) : ''
  return { entries, dishes: dishes.filter((d) => entries.some((e) => e.newDish === d.tempId)), message, dropped }
}
