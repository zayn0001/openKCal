// Dishes: foods you make by joining ingredients. Saved with your foods (so they sync and show up
// in every search) with their ingredients kept, so a dish can be opened and changed later.
import { EXTRAS, NUTRIENTS, scale, sum } from './nutrition.js'

/**
 * A dish as a food: per-100 g values from its ingredients, and a "serving" portion.
 * ingredients: [{ name, grams, per100, foodId?, source? }] (raw weights)
 * cookedGrams: what the finished pot weighs, when known. Cooking drives water off (dal, sabzi) or
 *   in (rice, oats), so nutrients per 100 g of the cooked dish differ from the raw sum. Without it
 *   the raw total weight is used.
 */
export function buildDish({ id, name, ingredients, servings = 1, cookedGrams = null, created }) {
  const raw = ingredients.reduce((g, i) => g + (i.grams || 0), 0)
  const weight = cookedGrams > 0 ? cookedGrams : raw
  const total = sum(ingredients.map((i) => scale(i.per100, i.grams)))
  const per100 = {}
  for (const k of NUTRIENTS) per100[k] = weight ? (total[k] * 100) / weight : 0
  // An extra counts only when every ingredient has it; a partial sum would read too low.
  for (const k of EXTRAS) if (ingredients.length && total.known[k] === ingredients.length) per100[k] = (total[k] * 100) / weight
  const n = Math.max(1, Math.round(servings) || 1)
  return {
    ...(id && { id }),
    kind: 'dish',
    name: String(name).trim(),
    ingredients: ingredients.map(({ name, grams, per100, foodId, source }) => ({ name, grams, per100, ...(foodId && { foodId }), ...(source && { source }) })),
    servings: n,
    cookedGrams: cookedGrams > 0 ? cookedGrams : null,
    rawGrams: raw,
    per100,
    portions: weight ? [{ name: 'serving', grams: Math.round(weight / n) }] : [],
    created: created || new Date().toISOString(),
    updated: new Date().toISOString(),
  }
}

/** The totals of a whole dish (all servings), for the builder's running figures. */
export const dishTotals = (dish) => scale(dish.per100, dish.cookedGrams || dish.rawGrams || 0)
