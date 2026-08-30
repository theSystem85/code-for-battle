export const COMPACT_SAVE_FORMAT = 'code-for-battle-save'
export const COMPACT_SAVE_VERSION = 1
export const SAVE_EXPORT_FORMAT_STORAGE_KEY = 'rts_save_export_format'

export function encodeCompactSave(saveObject) {
  const state = parseState(saveObject?.state)
  const compactState = { ...state }
  const rows = Array.isArray(state.mapTileState) ? state.mapTileState : []
  if (rows.length > 0) {
    compactState.map = encodeTileMap(rows)
    delete compactState.mapTileState
    delete compactState.mapGridTypes
    delete compactState.orePositions
  }
  return {
    format: COMPACT_SAVE_FORMAT,
    version: COMPACT_SAVE_VERSION,
    label: saveObject?.label || 'Unnamed',
    time: Number.isFinite(saveObject?.time) ? saveObject.time : Date.now(),
    state: compactState
  }
}

export function decodeSaveObject(saveObject) {
  if (!isCompactSave(saveObject)) {
    return { ...saveObject, state: typeof saveObject?.state === 'string' ? saveObject.state : JSON.stringify(saveObject?.state || {}) }
  }
  if (saveObject.version !== COMPACT_SAVE_VERSION) throw new Error(`Unsupported compact save version: ${saveObject.version}`)
  const state = { ...(saveObject.state || {}) }
  if (state.map) {
    state.mapTileState = decodeTileMap(state.map)
    state.mapGridTypes = state.mapTileState.map(row => row.map(tile => tile.type || 'land'))
    state.orePositions = []
    state.mapTileState.forEach((row, y) => row.forEach((tile, x) => {
      if (tile.ore) state.orePositions.push({ x, y })
    }))
    delete state.map
  }
  return { label: saveObject.label || 'Unnamed', time: saveObject.time, state: JSON.stringify(state) }
}

export function isCompactSave(value) {
  return value?.format === COMPACT_SAVE_FORMAT && value?.state && typeof value.state === 'object'
}

function parseState(state) {
  if (typeof state === 'string') return JSON.parse(state)
  return state && typeof state === 'object' ? state : {}
}

function encodeTileMap(rows) {
  const width = rows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0)
  const height = rows.length
  const palette = []
  const indexes = new Map()
  const runs = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = JSON.parse(JSON.stringify(rows[y]?.[x] || { type: 'land', ore: false, seedCrystal: false }))
      const signature = JSON.stringify(tile)
      let paletteIndex = indexes.get(signature)
      if (paletteIndex === undefined) {
        paletteIndex = palette.length
        indexes.set(signature, paletteIndex)
        palette.push(tile)
      }
      const previous = runs[runs.length - 1]
      if (previous?.[0] === paletteIndex) previous[1]++
      else runs.push([paletteIndex, 1])
    }
  }
  return { width, height, palette, runs }
}

function decodeTileMap(map) {
  const width = Math.max(0, Math.floor(map.width || 0))
  const height = Math.max(0, Math.floor(map.height || 0))
  const tiles = []
  for (const [paletteIndex, count] of map.runs || []) {
    const tile = map.palette?.[paletteIndex] || { type: 'land', ore: false, seedCrystal: false }
    for (let index = 0; index < count && tiles.length < width * height; index++) {
      tiles.push({ ...tile, decal: tile.decal ? { ...tile.decal } : tile.decal })
    }
  }
  while (tiles.length < width * height) tiles.push({ type: 'land', ore: false, seedCrystal: false })
  return Array.from({ length: height }, (_unused, y) => tiles.slice(y * width, (y + 1) * width))
}
