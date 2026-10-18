import * as updateNotice from './swappable/updateNotice.js'

const definitions = new Map([
  ['update-notice', { current: updateNotice }]
])

export function getLiveModule(key) {
  return definitions.get(key)?.current || null
}

export function getSwappableModuleKeys() {
  return [...definitions.keys()]
}

export function validateLiveModule(key, candidate) {
  if (!definitions.has(key)) throw new Error(`Unknown live module: ${key}`)
  if (!candidate || candidate.hotSwappable !== true) throw new Error(`Module is not hot-swappable: ${key}`)
}

export function replaceLiveModule(key, candidate) {
  validateLiveModule(key, candidate)
  const definition = definitions.get(key)
  const previous = definition.current
  definition.current = candidate
  return previous
}

export function restoreLiveModule(key, previous) {
  definitions.get(key).current = previous
}
