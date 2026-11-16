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
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_quantity,quantity`,
  )
  if (!res.ok && res.status !== 404) throw new Error(`Open Food Facts answered ${res.status}`)
  return offToFood(code, await res.json().catch(() => null))
}
