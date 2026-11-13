// Foods whose name contains every word of the query, best match first: names
// starting with the query's first word, then names containing it as a whole
// word ("roti" before "rotisserie"), then shorter names.
export function searchFoods(foods, query, limit = 40) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return foods.slice(0, limit)
  const rank = (n) => (n.startsWith(words[0]) ? 0 : n.split(/[^a-z]+/).includes(words[0]) ? 1 : 2)
  return foods
    .map((f) => ({ f, n: f.name.toLowerCase() }))
    .filter(({ n }) => words.every((w) => n.includes(w)))
    .sort((a, b) => rank(a.n) - rank(b.n) || a.n.length - b.n.length)
    .slice(0, limit)
    .map(({ f }) => f)
}
