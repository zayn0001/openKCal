// The synced app data: its keys, its shape check, and the two-device merge.
// Shared by the browser store and the server.
export const KEYS = ['profile', 'diary', 'foods', 'weights', 'water', 'gone']

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

export const pick = (s) => Object.fromEntries(KEYS.map((k) => [k, s[k]]))

// ponytail: checks top-level shape only, not every entry; deepen if state ever
// comes from anywhere but this app's own export or server.
export const isState = (d) =>
  isObj(d) &&
  (d.profile == null || isObj(d.profile)) &&
  isObj(d.diary) &&
  Array.isArray(d.foods) &&
  isObj(d.weights) &&
  isObj(d.water) &&
  (d.gone === undefined || Array.isArray(d.gone))

// Merge this device's state with the server's after both changed.
// Diary entries and foods are unioned by id, minus anything either side deleted
// (`gone` holds deleted ids). For single values (profile, a day's weight or
// water) this device wins.
// ponytail: `gone` only grows; prune ids older than a few months if it gets big.
export function mergeState(local, remote) {
  if (!remote) return local
  const gone = [...new Set([...(remote.gone || []), ...(local.gone || [])])]
  const dead = new Set(gone)
  const union = (theirs = [], mine = []) => {
    const byId = new Map()
    for (const x of [...theirs, ...mine]) if (!dead.has(x.id)) byId.set(x.id, x)
    return [...byId.values()]
  }
  const diary = {}
  for (const date of new Set([...Object.keys(remote.diary), ...Object.keys(local.diary)]))
    diary[date] = union(remote.diary[date], local.diary[date])
  return {
    profile: local.profile ?? remote.profile ?? null,
    diary,
    foods: union(remote.foods, local.foods),
    weights: { ...remote.weights, ...local.weights },
    water: { ...remote.water, ...local.water },
    gone,
  }
}
