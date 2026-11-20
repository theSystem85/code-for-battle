// Client-only choice between the current sound-effect take and the pre-v3 copy.
// This never enters game state, saves, replays, or multiplayer snapshots.

import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'

export const SOUND_VERSION_STORAGE_KEY = 'cfb-sound-version-preferences'

const pairs = new Set()
const listeners = new Set()

export function registerSoundVersionPairs(fileNames) {
  for (const fileName of fileNames) pairs.add(fileName)
}

export function soundVersionPairNames() {
  return [...pairs].sort()
}

function readStored() {
  try {
    const raw = getStoredItem(SOUND_VERSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function soundFileName(assetPath) {
  const normalized = String(assetPath || '').replace(/\\/g, '/').replace(/^\//, '')
  return normalized.split('/').pop()
}

export function prefersNewSound(fileName) {
  return readStored()[fileName] === 'new'
}

export function legacySoundAssetPath(fileName) {
  return `sound/legacy/${fileName}`
}

export function currentSoundAssetPath(fileName) {
  if (fileName === 'mine_explosion.mp3') return 'mine_explosion.mp3'
  return `sound/${fileName}`
}

// Returns the file the game should fetch. Unpaired paths pass through.
// A path that already points at sound/legacy/ is left alone.
export function resolveSoundAssetPath(assetPath) {
  const normalized = String(assetPath || '').replace(/\\/g, '/').replace(/^\//, '')
  const fileName = soundFileName(normalized)
  if (!pairs.has(fileName)) return normalized
  if (normalized.startsWith('sound/legacy/')) return normalized
  const current = currentSoundAssetPath(fileName)
  if (normalized !== current) return normalized
  return prefersNewSound(fileName) ? current : legacySoundAssetPath(fileName)
}

export function setSoundVersion(fileName, useNew) {
  const stored = readStored()
  if (useNew) stored[fileName] = 'new'
  else delete stored[fileName]
  const kept = {}
  for (const [name, value] of Object.entries(stored)) {
    if (value === 'new') kept[name] = 'new'
  }
  setStoredItem(SOUND_VERSION_STORAGE_KEY, JSON.stringify(kept))
  listeners.forEach(listener => listener(fileName, Boolean(useNew)))
}

export function onSoundVersionChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function soundVersionConfigDocument() {
  const sounds = {}
  for (const fileName of soundVersionPairNames()) {
    sounds[fileName] = prefersNewSound(fileName) ? 'new' : 'old'
  }
  return { version: 1, default: 'old', sounds }
}

export function downloadSoundVersionConfig() {
  const payload = JSON.stringify(soundVersionConfigDocument(), null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'code-for-battle-sound-versions.json'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
