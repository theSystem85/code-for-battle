import { normalizeSpriteSheetZoomFactor } from '../utils/spriteSheetMetadata.js'
import { normalizeDecorationSettings } from './decorationSettings.js'

// Configuration work only: never call from an entity or rendering loop.
export function computeMapTopologyFingerprint({ enabled = false, sheets = [], ...settings } = {}) {
  if (!enabled || sheets.length === 0) return 'default'
  const tags = value => [...new Set(Array.isArray(value) ? value : [])].sort()
  const canonical = sheets.map(({ sheetPath, metadata = {} }) => ({
    sheetPath,
    ...(normalizeSpriteSheetZoomFactor(metadata.zoomFactor) !== 1 ? { zoomFactor: normalizeSpriteSheetZoomFactor(metadata.zoomFactor) } : {}),
    tags: tags(metadata.tags),
    tiles: Object.keys(metadata.tiles || {}).sort().map(key => [key, tags(metadata.tiles[key]?.tags)])
  })).sort((a, b) => a.sheetPath < b.sheetPath ? -1 : a.sheetPath > b.sheetPath ? 1 : 0)
  const input = JSON.stringify([canonical, normalizeDecorationSettings(settings)])
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619) >>> 0
  return hash.toString(16).padStart(8, '0')
}

export function topologyChangesAllowed(state, authoritative = false) {
  const session = state.multiplayerSession || {}
  const multiplayer = session.isRemote || session.status === 'connected'
  return !multiplayer || (!state.gameStarted && (authoritative || session.localRole === 'host'))
}
