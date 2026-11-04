import { DECORATION_SETTINGS, clampDecorationSetting } from './decorationSettings.js'

const observed = new WeakMap()

// Configuration writes are the boundary. Render readers consume one primitive
// revision, without scanning settings or constructing/serializing snapshots.
// Accessors stay enumerable and retain the original raw values for save/UI
// compatibility. Installing observation twice preserves identity.
export function observeDecorationConfiguration(state) {
  const existing = observed.get(state)
  if (existing) return existing
  const record = { revision: 0 }
  for (const key of [...Object.keys(DECORATION_SETTINGS), 'mapSeed', 'playerCount']) {
    let value = state[key]
    const descriptor = Object.getOwnPropertyDescriptor(state, key)
    if (descriptor && !descriptor.configurable) throw new Error(`Decoration setting cannot be observed: ${key}`)
    Object.defineProperty(state, key, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: () => value,
      set(next) {
        if (Object.is(value, next)) return
        const previous = value
        value = next
        // The aggregate is derived from the part counts by normalization.
        if (key === 'decorativeTileCount') return
        const equal = Object.hasOwn(DECORATION_SETTINGS, key)
          ? clampDecorationSetting(key, previous) === clampDecorationSetting(key, next)
          : Object.is(previous, next)
        if (!equal) record.revision++
      }
    })
  }
  observed.set(state, record)
  return record
}
