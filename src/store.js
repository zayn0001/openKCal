import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isState, pick } from './lib/state'

// Local calendar day as YYYY-MM-DD (en-CA formats dates that way).
export const today = () => new Date().toLocaleDateString('en-CA')

// Most recent weigh-in, or undefined. ISO dates sort as strings.
export const latestWeight = (weights) => weights[Object.keys(weights).sort().at(-1)]

// All app data. Diary entries snapshot their nutrients when logged, so editing
// or losing a food later never rewrites history.
export const useStore = create(
  persist(
    (set) => ({
      profile: null, // { sex, age, heightCm, weightKg, activity, goal, goalWeightKg }
      diary: {}, // date -> [{ id, meal, name, grams, kcal, protein, carbs, fat, fibre }]
      foods: [], // custom foods and recipes, same shape as the catalogue
      weights: {}, // date -> kg
      water: {}, // date -> glasses
      gone: [], // ids of deleted entries and foods, so sync doesn't resurrect them

      setProfile: (profile) => set({ profile }),
      addEntry: (date, entry) =>
        set((s) => ({
          diary: { ...s.diary, [date]: [...(s.diary[date] || []), { id: crypto.randomUUID(), ...entry }] },
        })),
      removeEntry: (date, id) =>
        set((s) => ({ diary: { ...s.diary, [date]: s.diary[date].filter((e) => e.id !== id) }, gone: [...s.gone, id] })),
      addFood: (food) =>
        set((s) => ({
          foods: [{ id: crypto.randomUUID(), ...food }, ...s.foods.filter((f) => f.id !== food.id)],
          gone: s.gone.filter((id) => id !== food.id), // re-adding a scanned product un-deletes it
        })),
      removeFood: (id) => set((s) => ({ foods: s.foods.filter((f) => f.id !== id), gone: [...s.gone, id] })),
      setWeight: (date, kg) => set((s) => ({ weights: { ...s.weights, [date]: kg } })),
      addWater: (date, n) =>
        set((s) => ({ water: { ...s.water, [date]: Math.max(0, (s.water[date] || 0) + n) } })),

      // Replace everything from an export file. Returns false if it isn't one.
      importState: (d) => {
        if (!isState(d)) return false
        set({ ...pick(d), profile: d.profile ?? null, gone: d.gone || [] })
        return true
      },
    }),
    { name: 'food_state_v1' },
  ),
)
