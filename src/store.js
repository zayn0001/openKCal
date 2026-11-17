import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { withDefaults } from './lib/settings'
import { isState, pick } from './lib/state'

// Local calendar day as YYYY-MM-DD (en-CA formats dates that way).
export const today = () => new Date().toLocaleDateString('en-CA')

// Most recent weigh-in, or undefined. ISO dates sort as strings.
export const latestWeight = (weights = {}) => weights[Object.keys(weights).sort().at(-1)]

export const EMPTY = {
  profile: null,
  diary: {},
  foods: [],
  weights: {},
  water: {},
  gone: [],
  settings: {},
  // HealthifyMe & Top Tracker extensions
  fasting: { startTime: null, protocol: '16:8' },
  exercises: {}, // date -> [{ id, name, type, minutes, kcal }]
  measurements: {}, // date -> { waist, chest, hips, arms, thighs, neck, bodyFat }
  coachChat: [], // [{ id, role: 'user'|'coach', text, time }]
  openGymSync: { lastSync: null, autoSync: true, workoutsCount: 0, weightsCount: 0 },
  openGymRemote: {
    connected: false,
    serverUrl: '',
    token: '',
    user: null,
    lastRev: null,
    lastSync: null,
    autoSync: true,
  },
  sharedRecipes: [], // Recipe dishes made by all users
}

// All app data. Diary entries snapshot their nutrients when logged, so editing or losing a food
// later never rewrites history.
export const useStore = create(
  persist(
    (set) => ({
      ...EMPTY,

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
        set((s) => ({ diary: { ...s.diary, [date]: (s.diary[date] || []).filter((e) => e.id !== id) }, gone: [...s.gone, id] })),

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

      // Extended trackers
      setFasting: (fasting) => set((s) => ({ fasting: { ...(s.fasting || {}), ...fasting } })),

      addExercise: (date, ex) =>
        set((s) => ({
          exercises: { ...s.exercises, [date]: [...(s.exercises?.[date] || []), ex] },
        })),

      removeExercise: (date, id) =>
        set((s) => ({
          exercises: {
            ...s.exercises,
            [date]: (s.exercises?.[date] || []).filter((x) => x.id !== id),
          },
        })),

      setMeasurements: (date, data) =>
        set((s) => ({
          measurements: {
            ...s.measurements,
            [date]: { ...(s.measurements?.[date] || {}), ...data },
          },
        })),

      addCoachMessage: (msg) =>
        set((s) => ({
          coachChat: [...(s.coachChat || []), { id: crypto.randomUUID(), time: Date.now(), ...msg }],
        })),

      clearCoachChat: () => set({ coachChat: [] }),

      setOpenGymSync: ({ weights, exercises, measurements, profile, syncStats }) =>
        set((s) => ({
          ...(weights ? { weights } : {}),
          ...(exercises ? { exercises } : {}),
          ...(measurements ? { measurements } : {}),
          ...(profile ? { profile } : {}),
          openGymSync: { ...(s.openGymSync || {}), ...(syncStats || {}), lastSync: Date.now() },
        })),

      setAutoSyncOpenGym: (autoSync) =>
        set((s) => ({
          openGymSync: { ...(s.openGymSync || {}), autoSync },
        })),

      setOpenGymRemote: (data) =>
        set((s) => ({
          openGymRemote: { ...(s.openGymRemote || {}), ...data },
        })),

      disconnectOpenGymRemote: () =>
        set({
          openGymRemote: {
            connected: false,
            serverUrl: '',
            token: '',
            user: null,
            lastRev: null,
            lastSync: null,
            autoSync: true,
          },
        }),

      setSharedRecipes: (sharedRecipes) =>
        set({ sharedRecipes: Array.isArray(sharedRecipes) ? sharedRecipes : [] }),

      addSharedRecipe: (recipe) =>
        set((s) => ({
          sharedRecipes: [recipe, ...(s.sharedRecipes || []).filter((r) => r.id !== recipe.id)],
        })),

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
