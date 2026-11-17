// Accent colour management matching openGym design system
export const ACCENTS = {
  lime: '#30d158',
  sky: '#0a84ff',
  orange: '#ff9f0a',
  violet: '#bf5af2',
  pink: '#ff375f',
  red: '#ff453a',
  teal: '#40c8e0',
  gold: '#ffd60a',
  white: '#ffffff',
  // Backwards compatibility aliases
  green: '#30d158',
  blue: '#0a84ff',
  purple: '#bf5af2',
}

export const ACCENT_NAMES = {
  lime: 'Lime Green',
  sky: 'Sky Blue',
  orange: 'Sunset Orange',
  violet: 'Royal Violet',
  pink: 'Rose Pink',
  red: 'Flame Red',
  teal: 'Ocean Teal',
  gold: 'Sun Gold',
  white: 'White',
}

export const ACCENT_INK = {
  lime: '#000000',
  sky: '#ffffff',
  orange: '#000000',
  violet: '#ffffff',
  pink: '#ffffff',
  red: '#ffffff',
  teal: '#000000',
  gold: '#000000',
  white: '#000000',
  green: '#000000',
  blue: '#ffffff',
  purple: '#ffffff',
}

export const DEFAULT_ACCENT = 'lime'

export function normalizeAccent(name) {
  if (name === 'green') return 'lime'
  if (name === 'blue') return 'sky'
  if (name === 'purple') return 'violet'
  if (Object.hasOwn(ACCENTS, name)) return name
  return DEFAULT_ACCENT
}

export function applyAccent(el, accentKey, theme) {
  const norm = normalizeAccent(accentKey)
  el.dataset.accent = norm
  // White would vanish on the light theme's white background: there it is near-black, as in openGym
  const inverted = norm === 'white' && theme === 'light'
  const color = inverted ? '#1c1c1e' : ACCENTS[norm] || ACCENTS.lime
  const ink = inverted ? '#ffffff' : ACCENT_INK[norm] || '#000000'
  el.style.setProperty('--acc', color)
  el.style.setProperty('--acc-ink', theme === 'light' && norm === 'gold' ? '#b08d00' : color)
  el.style.setProperty('--on-acc', ink)
}
