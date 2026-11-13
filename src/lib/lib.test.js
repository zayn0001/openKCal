import assert from 'node:assert/strict'
import test from 'node:test'
import { recipePer100, scale, sum } from './nutrition.js'
import { searchFoods } from './search.js'
import { isState, mergeState } from './state.js'
import { targets } from './targets.js'
import { shiftDate, weekSummary } from './week.js'

const rice = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 }
const ghee = { kcal: 900, protein: 0, carbs: 0, fat: 100, fibre: 0 }

test('scale and sum', () => {
  assert.equal(scale(rice, 150).kcal, 195)
  assert.equal(sum([scale(rice, 100), scale(ghee, 10)]).kcal, 220)
  assert.equal(sum([]).kcal, 0)
})

test('recipePer100 weights ingredients by grams', () => {
  const r = recipePer100([{ per100: rice, grams: 190 }, { per100: ghee, grams: 10 }])
  assert.equal(Math.round(r.kcal), 169) // (247 + 90) kcal in 200 g
  assert.equal(recipePer100([]).kcal, 0) // no divide-by-zero
})

test('targets: Mifflin-St Jeor, macros add up, floor holds', () => {
  const p = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'hold' }
  const t = targets(p)
  assert.equal(t.kcal, 2759) // BMR 1780 x 1.55
  assert.equal(t.protein, 128)
  assert.ok(Math.abs(t.protein * 4 + t.carbs * 4 + t.fat * 9 - t.kcal) < 10)
  assert.equal(targets({ ...p, goal: 'lose' }).kcal, 2259)
  const small = { sex: 'female', age: 60, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose' }
  assert.equal(targets(small).kcal, 1200)
})

test('searchFoods: every word must match, prefix and short names first', () => {
  const foods = ['Chicken curry with rice', 'Curry, chicken', 'Chicken curry', 'Rice'].map((name) => ({ name }))
  assert.deepEqual(searchFoods(foods, 'chicken  CURRY').map((f) => f.name), ['Chicken curry', 'Chicken curry with rice', 'Curry, chicken'])
  assert.equal(searchFoods(foods, '  ').length, 4)
  const roti = ['Chicken, rotisserie', 'Bread, chappatti or roti'].map((name) => ({ name }))
  assert.equal(searchFoods(roti, 'roti')[0].name, 'Bread, chappatti or roti') // whole word wins
  assert.equal(searchFoods(foods, 'paneer').length, 0)
})

test('mergeState: union by id, deletions win, this device wins single values', () => {
  const e = (id) => ({ id, kcal: 1 })
  const local = { profile: null, diary: { d1: [e('a'), e('new')] }, foods: [e('f1')], weights: { d1: 70 }, water: { d1: 2 }, gone: ['b'] }
  const remote = { profile: { age: 30 }, diary: { d1: [e('a'), e('b')], d2: [e('c')] }, foods: [e('f1'), e('f2')], weights: { d1: 71, d0: 72 }, water: {}, gone: ['f2'] }
  const m = mergeState(local, remote)
  assert.deepEqual(m.diary.d1.map((x) => x.id), ['a', 'new']) // b was deleted here, so it stays deleted
  assert.deepEqual(m.diary.d2.map((x) => x.id), ['c'])
  assert.deepEqual(m.foods.map((x) => x.id), ['f1']) // f2 was deleted on the other device
  assert.deepEqual(m.weights, { d1: 70, d0: 72 })
  assert.deepEqual(m.profile, { age: 30 })
  assert.deepEqual(m.gone.sort(), ['b', 'f2'])
  assert.ok(isState(m))
  assert.equal(mergeState(local, null), local) // brand-new account
  assert.ok(!isState({ diary: [] }))
})

test('weekSummary: seven days, rounded totals, weight change', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
  const state = { diary: { '2026-03-07': [{ kcal: 199.6, protein: 10 }] }, weights: { '2026-03-02': 80, '2026-03-06': 79.2, '2026-01-01': 90 } }
  const s = weekSummary(state, { kcal: 2000 }, '2026-03-07')
  assert.equal(s.days.length, 7)
  assert.deepEqual([s.days[0].date, s.days[0].logged, s.days[6].kcal, s.days[6].logged], ['2026-03-01', false, 200, true])
  assert.deepEqual(s.weightKg, { start: 80, end: 79.2 })
})
