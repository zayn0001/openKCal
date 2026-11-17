// Open Food Facts: packaged foods by barcode. Free, crowd-sourced, ODbL-licensed.
// True when this browser can read barcodes from the camera (not iOS Safari).
export const canScan = 'BarcodeDetector' in globalThis && !!globalThis.navigator?.mediaDevices

export const isBarcode = (s) => /^\d{8,14}$/.test(s)

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
const opt = (v, k = 1) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) * k : undefined)

// An OFF product response -> a food in our shape, or null if it has no usable energy value.
export function offToFood(code, json) {
  const p = json?.product
  const n = p?.nutriments
  if (json?.status !== 1 || !p?.product_name || !Number.isFinite(Number(n?.['energy-kcal_100g']))) return null
  const serving = num(p.serving_quantity)
  return {
    id: `off:${code}`,
    name: [p.product_name, p.brands?.split(',')[0]].filter(Boolean).join(', ').slice(0, 80),
    source: 'OFF',
    per100: {
      kcal: num(n['energy-kcal_100g']),
      protein: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
      fibre: num(n.fiber_100g),
      ...(opt(n.sugars_100g) !== undefined && { sugar: opt(n.sugars_100g) }),
      ...(opt(n['saturated-fat_100g']) !== undefined && { satFat: opt(n['saturated-fat_100g']) }),
      ...(opt(n.sodium_100g) !== undefined && { sodium: opt(n.sodium_100g, 1000) }), // OFF gives grams
    },
    portions: serving ? [{ name: 'serving', grams: serving }] : [],
  }
}

export async function lookupBarcode(code) {
  const url = `https://world.openfoodfacts.net/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,quantity`
  const headers = { 'User-Agent': 'openKCal - Web - Version 0.3.0 - https://github.com/openkcal/openkcal' }
  const res = await fetch(url, { headers }).catch(() => null)
  if (!res || (!res.ok && res.status !== 404)) {
    // Fallback to world.openfoodfacts.org
    const fallback = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,quantity`,
      { headers },
    ).catch(() => null)
    if (!fallback?.ok) return null
    return offToFood(code, await fallback.json().catch(() => null))
  }
  return offToFood(code, await res.json().catch(() => null))
}

/** Search Open Food Facts database by text query when not found in local catalogue. */
export async function searchOff(query, limit = 15) {
  const q = (query || '').trim()
  if (!q || q.length < 2) return []
  const url = `https://world.openfoodfacts.net/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=code,product_name,brands,nutriments,serving_quantity,quantity`
  const headers = { 'User-Agent': 'openKCal - Web - Version 0.3.0 - https://github.com/openkcal/openkcal' }
  let res = await fetch(url, { headers }).catch(() => null)
  if (!res || !res.ok) {
    // Fallback to .org mirror
    const fbUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}&fields=code,product_name,brands,nutriments,serving_quantity,quantity`
    res = await fetch(fbUrl, { headers }).catch(() => null)
  }
  if (!res || !res.ok) return []
  const data = await res.json().catch(() => null)
  const products = Array.isArray(data?.products) ? data.products : []
  const results = []
  for (const p of products) {
    if (!p || !p.code) continue
    const food = offToFood(p.code, { status: 1, product: p })
    if (food) results.push(food)
  }
  return results
}
