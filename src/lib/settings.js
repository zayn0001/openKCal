// Synced preferences (state.settings), with defaults filled in. Each top-level section syncs as a
// whole: the last device to change a section wins it.

export const MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner']

// Modules, as in openGym: whole parts of the app on or off. Off only hides; nothing is deleted.
export const MODULES = {
  water: { label: 'Water', what: 'The water card in the diary.' },
  weight: { label: 'Weight', what: 'The Weight tab and the goal weight.' },
  scanner: { label: 'Barcode lookup', what: 'Scanning or typing a barcode to find packaged food (Open Food Facts).' },
  ai: { label: 'AI', what: 'Photo logging, the weekly review, and Settings → AI.' },
  reminders: { label: 'Reminders', what: 'Meal reminders by notification.' },
  webhooks: { label: 'Webhooks', what: 'Settings → Integrations. Webhooks pause while this is off.' },
}
export const PRESETS = {
  'Just logging': Object.fromEntries(Object.keys(MODULES).map((k) => [k, false])),
  Everything: Object.fromEntries(Object.keys(MODULES).map((k) => [k, true])),
}

export const ACCENTS = ['green', 'blue', 'orange', 'purple', 'red']

export function withDefaults(s = {}) {
  return {
    units: { energy: 'kcal', weight: 'kg', height: 'cm', ...s.units },
    look: { theme: 'system', accent: 'green', ...s.look },
    modules: { ...PRESETS.Everything, ...s.modules },
    reminders: {
      tz: null,
      meals: MEALS.map((meal, i) => ({ meal, time: ['08:30', '13:30', '17:00', '20:30'][i], on: false })),
      nudge: { on: false, time: '21:00' },
      ...s.reminders,
    },
  }
}

/** The preset these modules match, or 'Custom'. */
export const presetOf = (modules) =>
  Object.entries(PRESETS).find(([, p]) => Object.keys(p).every((k) => !!modules[k] === p[k]))?.[0] || 'Custom'
