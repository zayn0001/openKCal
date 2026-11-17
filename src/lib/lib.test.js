import assert from 'node:assert/strict'
import test from 'node:test'
import { cell, diaryCsv } from './csv.js'
import { buildDish, dishTotals } from './dish.js'
import { macroSplit, per100Of, recipePer100, scale, sum } from './nutrition.js'
import { presetOf, withDefaults } from './settings.js'
import { fmtAmount, fmtEnergy, heightToCm, weightFromKg, weightToKg } from './units.js'
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

  // Partial / missing profile fields never produce NaN
  const partial = targets({ sex: 'male', weightKg: 76.875 })
  assert.ok(Number.isFinite(partial.kcal) && partial.kcal > 1200)
  assert.equal(partial.protein, 123)
  assert.ok(Number.isFinite(partial.carbs) && partial.carbs > 0)
  assert.ok(Number.isFinite(partial.fat) && partial.fat > 0)
  assert.ok(Number.isFinite(partial.fibre) && partial.fibre > 0)

  const empty = targets({})
  assert.ok(Number.isFinite(empty.kcal) && empty.kcal >= 1200)
  assert.ok(Number.isFinite(empty.protein) && empty.protein > 0)

  const fromNull = targets(null)
  assert.ok(Number.isFinite(fromNull.kcal) && fromNull.kcal >= 1200)
})

test('searchFoods: every word must match, prefix and short names first', () => {
  const foods = ['Chicken curry with rice', 'Curry, chicken', 'Chicken curry', 'Rice'].map((name) => ({ name, source: 'USDA' }))
  assert.deepEqual(searchFoods(foods, 'chicken  CURRY').map((f) => f.name), ['Chicken curry', 'Chicken curry with rice', 'Curry, chicken'])
  assert.equal(searchFoods(foods, '  ').length, 4)
  const roti = ['Chicken, rotisserie', 'Bread, chappatti or roti'].map((name) => ({ name }))
  assert.equal(searchFoods(roti, 'roti')[0].name, 'Bread, chappatti or roti') // whole word wins
  const mine = [{ name: 'Dal makhani', source: 'USDA' }, { name: 'Dal makhani (mum’s)', kind: 'dish' }]
  assert.equal(searchFoods(mine, 'dal')[0].kind, 'dish') // your own dish first
  const rajma = [{ name: 'Rajmah, red', source: 'IFCT' }, { name: 'Test rajma chawal', kind: 'dish' }, { name: 'Pickled rajmas', kind: 'dish' }]
  assert.deepEqual(searchFoods(rajma, 'rajma').map((f) => f.name), ['Test rajma chawal', 'Rajmah, red', 'Pickled rajmas'])
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

test('extras (sugar, saturated fat, sodium): unknown stays unknown, partial sums say so', () => {
  const milk = { kcal: 61, protein: 3.3, carbs: 4.6, fat: 3.2, fibre: 0, sugar: 4.8, satFat: 1.9, sodium: 38 }
  assert.equal(scale(milk, 200).sodium, 76)
  assert.equal('sugar' in scale(rice, 100), false)
  const t = sum([scale(milk, 100), scale(rice, 100)])
  assert.deepEqual([t.sugar, t.known.sugar, t.known.count], [4.8, 1, 2])
  assert.equal(Math.round(per100Of({ grams: 50, kcal: 30.5, sugar: 2.4 }).sugar), 5)
  assert.deepEqual(macroSplit({ protein: 25, carbs: 50, fat: 0 }), { protein: 33, carbs: 67, fat: 0 })
})

test('buildDish: raw or cooked weight, servings, extras only when every ingredient has them', () => {
  const dal = { kcal: 350, protein: 24, carbs: 60, fat: 1.5, fibre: 10 } // dry lentils
  const dish = buildDish({ name: ' Dal tadka ', ingredients: [{ name: 'Lentils', grams: 200, per100: dal }, { name: 'Ghee', grams: 20, per100: ghee }], servings: 4 })
  assert.equal(dish.name, 'Dal tadka')
  assert.equal(dish.rawGrams, 220)
  assert.equal(Math.round(dishTotals(dish).kcal), 880) // 700 + 180
  assert.deepEqual(dish.portions, [{ name: 'serving', grams: 55 }])
  // Cooked in water to 800 g: same nutrients spread over more weight.
  const cooked = buildDish({ name: 'Dal', ingredients: dish.ingredients, servings: 4, cookedGrams: 800 })
  assert.equal(Math.round(cooked.per100.kcal), 110)
  assert.equal(Math.round(dishTotals(cooked).kcal), 880)
  assert.deepEqual(cooked.portions, [{ name: 'serving', grams: 200 }])
  assert.equal('sugar' in cooked.per100, false)
  const withSugar = buildDish({ name: 'x', ingredients: [{ name: 'a', grams: 100, per100: { ...rice, sugar: 1 } }] })
  assert.equal(withSugar.per100.sugar, 1)
})

test('units, settings defaults, CSV', () => {
  assert.equal(fmtEnergy(100, 'kJ'), '418 kJ')
  assert.equal(fmtEnergy(99.6), '100 kcal')
  assert.equal(Math.round(weightFromKg(80, 'lb')), 176)
  assert.equal(Math.round(weightToKg(176.37, 'lb')), 80)
  assert.equal(Math.round(heightToCm(70, 'in')), 178)
  assert.deepEqual([fmtAmount(0.04, 'g'), fmtAmount(12.6, 'g'), fmtAmount(388.4, 'mg'), fmtAmount(undefined, 'g')], ['0 g', '13 g', '388 mg', '—'])
  const s = withDefaults({ modules: { water: false }, units: { energy: 'kJ' } })
  assert.deepEqual([s.units.energy, s.units.weight, s.modules.water, s.modules.ai], ['kJ', 'kg', false, true])
  assert.equal(presetOf(withDefaults().modules), 'Everything')
  assert.equal(presetOf(s.modules), 'Custom')
  assert.equal(cell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(cell('Dal, tadka "home"'), '"Dal, tadka ""home"""')
  const csv = diaryCsv({ '2026-01-02': [{ meal: 'Lunch', name: 'Dal', grams: 150, kcal: 150.04 }] })
  assert.equal(csv.split(/\r\n/)[1], '2026-01-02,Lunch,Dal,150,150,,,,,,,')
})

test('logStreak counts back from today, tolerating an unlogged today', async () => {
  const { logStreak } = await import('./nutrition.js')
  const now = new Date(2026, 10, 17)
  const e = [{ kcal: 1 }]
  assert.equal(logStreak({}, now), 0)
  assert.equal(logStreak({ '2026-11-17': e, '2026-11-16': e }, now), 2)
  assert.equal(logStreak({ '2026-11-16': e, '2026-11-15': e, '2026-11-13': e }, now), 2)
  assert.equal(logStreak({ '2026-11-15': e }, now), 0)
})

test('markdown: inline marks, lists, nested bullets, headings', async () => {
  const { parseBlocks, parseInline } = await import('./markdown.js')
  assert.deepEqual(parseInline('a **b** *c* `d`'), [
    { t: 'text', v: 'a ' }, { t: 'b', v: 'b' }, { t: 'text', v: ' ' }, { t: 'i', v: 'c' }, { t: 'text', v: ' ' }, { t: 'code', v: 'd' },
  ])
  assert.deepEqual(parseInline('2 * 3 = 6'), [{ t: 'text', v: '2 * 3 = 6' }])
  const b = parseBlocks('## Plan\nIntro line\n\n1. **One**\n   • sub\n2. Two\n\n• x\n- y')
  assert.deepEqual(b.map((x) => x.type), ['h', 'p', 'ol', 'ul'])
  assert.equal(b[0].text, 'Plan')
  assert.deepEqual(b[2].items, [{ text: '**One**', sub: false }, { text: 'sub', sub: true }, { text: 'Two', sub: false }])
  assert.equal(b[3].items.length, 2)
})
