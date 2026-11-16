import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { withDefaults } from './lib/settings'
import { isState, pick } from './lib/state'

// Local calendar day as YYYY-MM-DD (en-CA formats dates that way).
export const today = () => new Date().toLocaleDateString('en-CA')

// Most recent weigh-in, or undefined. ISO dates sort as strings.
export const latestWeight = (weights) => weights[Object.keys(weights).sort().at(-1)]

export const EMPTY = { profile: null, diary: {}, foods: [], weights: {}, water: {}, gone: [], settings: {} }

// All app data. Diary entries snapshot their nutrients when logged, so editing or losing a food
// later never rewrites history.
export const useStore = create(
  persist(
    (set) => ({
      ...EMPTY,
      // profile: { sex, age, heightCm, weightKg, activity, goal, goalWeightKg }
      // diary: date -> [{ id, meal, name, grams, kcal, protein, carbs, fat, fibre, sugar?, satFat?, sodium?, foodId? }]
      // foods: your foods and dishes, same shape as the catalogue (dishes: kind 'dish' plus ingredients)
      // weights: date -> kg; water: date -> glasses
      // gone: ids of deleted entries and foods, so sync doesn't resurrect them
      // settings: units, look, modules, reminders (lib/settings.js)

      setProfile: (profile) => set({ profile }),
      addEntry: (date, entry) =>
        set((s) => ({
          diary: { ...s.diary, [date]: [...(s.diary[date] || []), { id: crypto.randomUUID(), ...entry }] },
        })),
      // A changed entry gets a new id: the merge keeps the newer copy instead of both.
      updateEntry: (date, id, patch) =>
        set((s) => ({
          diary: { ...s.diary, [date]: s.diary[date].map((e) => (e.id === id ? { ...e, ...patch, id: crypto.randomUUID() } : e)) },
          gone: [...s.gone, id],
        })),
      removeEntry: (date, id) =>
        set((s) => ({ diary: { ...s.diary, [date]: s.diary[date].filter((e) => e.id !== id) }, gone: [...s.gone, id] })),
      // Saving a food or dish with an id replaces it under a new id, for the same reason.
      addFood: (food) => {
        const id = food.id && !food.id.startsWith('off:') ? crypto.randomUUID() : food.id || crypto.randomUUID()
        set((s) => ({
          foods: [{ ...food, id }, ...s.foods.filter((f) => f.id !== food.id)],
          gone: [...s.gone.filter((g) => g !== id), ...(food.id && food.id !== id ? [food.id] : [])],
        }))
        return id
      },
      removeFood: (id) => set((s) => ({ foods: s.foods.filter((f) => f.id !== id), gone: [...s.gone, id] })),
      setWeight: (date, kg) => set((s) => ({ weights: { ...s.weights, [date]: kg } })),
      removeWeight: (date) =>
        set((s) => {
          const weights = { ...s.weights }
          delete weights[date]
          return { weights }
        }),
      addWater: (date, n) => set((s) => ({ water: { ...s.water, [date]: Math.max(0, (s.water[date] || 0) + n) } })),
      setSettings: (section, value) => set((s) => ({ settings: { ...s.settings, [section]: value } })),

      // Replace everything from an export file. Returns false if it isn't one.
      importState: (d) => {
        if (!isState(d)) return false
        set({ ...pick(d), profile: d.profile ?? null, gone: d.gone || [], settings: d.settings || {} })
        return true
      },
      reset: () => set({ ...EMPTY }),
    }),
    { name: 'food_state_v1' },
  ),
)

/** Settings with defaults filled in. */
export const useSettings = () => withDefaults(useStore((s) => s.settings))
