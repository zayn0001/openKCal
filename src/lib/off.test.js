import assert from 'node:assert/strict'
import test from 'node:test'
import { isBarcode, offToFood } from './off.js'

test('isBarcode identifies standard EAN and UPC barcodes', () => {
  assert.equal(isBarcode('8906020580015'), true)
  assert.equal(isBarcode('737628064500'), true)
  assert.equal(isBarcode('12345678'), true)
  assert.equal(isBarcode('apple'), false)
  assert.equal(isBarcode('123'), false)
  assert.equal(isBarcode(''), false)
})

test('offToFood formats Open Food Facts product JSON to openKCal food shape', () => {
  const sampleJson = {
    status: 1,
    product: {
      product_name: 'Dark Chocolate 70%',
      brands: 'Amul, Gujarat Co-op',
      serving_quantity: 25,
      nutriments: {
        'energy-kcal_100g': 540,
        proteins_100g: 7.2,
        carbohydrates_100g: 58.0,
        fat_100g: 32.5,
        fiber_100g: 8.0,
        sugars_100g: 28.0,
        'saturated-fat_100g': 19.5,
        sodium_100g: 0.05, // grams -> 50mg
      },
    },
  }

  const food = offToFood('8901262010053', sampleJson)
  assert.ok(food)
  assert.equal(food.id, 'off:8901262010053')
  assert.equal(food.name, 'Dark Chocolate 70%, Amul')
  assert.equal(food.source, 'OFF')
  assert.equal(food.per100.kcal, 540)
  assert.equal(food.per100.protein, 7.2)
  assert.equal(food.per100.carbs, 58.0)
  assert.equal(food.per100.fat, 32.5)
  assert.equal(food.per100.fibre, 8.0)
  assert.equal(food.per100.sugar, 28.0)
  assert.equal(food.per100.satFat, 19.5)
  assert.equal(food.per100.sodium, 50)
  assert.deepEqual(food.portions, [{ name: 'serving', grams: 25 }])
})

test('offToFood returns null when product has no energy or name', () => {
  assert.equal(offToFood('123', null), null)
  assert.equal(offToFood('123', { status: 0 }), null)
  assert.equal(offToFood('123', { status: 1, product: { product_name: 'No Energy' } }), null)
})
