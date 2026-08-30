export const COMPACT_SAVE_FORMAT = 'CFB2'
export const COMPACT_SAVE_VERSION = 2
export const SAVE_EXPORT_FORMAT_STORAGE_KEY = 'rts_save_export_format'

const MAP_KEYS = new Set(['mapTileState', 'mapGridTypes', 'orePositions'])

export function encodeCompactSave(saveObject) {
  const state = parseState(saveObject?.state)
  const lines = [COMPACT_SAVE_FORMAT, `M|${cell(saveObject?.label || 'Unnamed')}|${cell(Number.isFinite(saveObject?.time) ? saveObject.time : Date.now())}`]

  const gameState = state.gameState || {}
  appendObjectTable(lines, 'gameState', [gameState])

  for (const [name, value] of Object.entries(state)) {
    if (name === 'gameState' || MAP_KEYS.has(name)) continue
    if (Array.isArray(value)) appendEntityTables(lines, name, value)
    else appendObjectTable(lines, name, [value])
  }

  if (Array.isArray(state.mapTileState) && state.mapTileState.length > 0) appendMap(lines, state.mapTileState)
  return lines.join('\n')
}

export function decodeSaveObject(saveObject) {
  if (typeof saveObject === 'string' && saveObject.startsWith(`${COMPACT_SAVE_FORMAT}\n`)) return decodeCfb(saveObject)
  if (typeof saveObject === 'string') return decodeSaveObject(JSON.parse(saveObject))
  if (isVersionOneCompactSave(saveObject)) return decodeVersionOne(saveObject)
  return { ...saveObject, state: typeof saveObject?.state === 'string' ? saveObject.state : JSON.stringify(saveObject?.state || {}) }
}

export function isCompactSave(value) {
  return (typeof value === 'string' && value.startsWith(`${COMPACT_SAVE_FORMAT}\n`)) || isVersionOneCompactSave(value)
}

export function getCompactSaveMetadata(text) {
  if (!isCompactSave(text)) return null
  const meta = text.split('\n', 2)[1]?.split('|') || []
  return { label: uncell(meta[1]), time: uncell(meta[2]) }
}

export function describeCompactSave(text) {
  return { bytes: new Blob([text]).size, characters: text.length, lines: text.split('\n').length }
}

function appendEntityTables(lines, name, values) {
  if (values.length === 0) {
    lines.push(`S|${escapeText(`${name}:_`)}|@index`)
    return
  }
  const groups = new Map()
  values.forEach((value, index) => {
    const discriminator = value && typeof value === 'object' && !Array.isArray(value)
      ? String(value.type || value.unitType || value.kind || '_')
      : '_'
    if (!groups.has(discriminator)) groups.set(discriminator, [])
    groups.get(discriminator).push({ value, index })
  })
  for (const [kind, rows] of groups) appendObjectTable(lines, `${name}:${kind}`, rows.map(row => row.value), rows.map(row => row.index))
}

function appendObjectTable(lines, name, rows, indexes = null) {
  const objects = rows.map(value => value && typeof value === 'object' && !Array.isArray(value) ? value : { value })
  const columns = [...new Set(objects.flatMap(object => Object.keys(object)))]
  if (indexes) columns.unshift('@index')
  lines.push(`S|${escapeText(name)}|${columns.map(escapeText).join('|')}`)
  objects.forEach((object, rowIndex) => {
    const values = columns.map(column => column === '@index' ? cell(indexes[rowIndex]) : cell(object[column]))
    lines.push(`R|${values.join('|')}`)
  })
}

function appendMap(lines, rows) {
  const width = rows.reduce((maximum, row) => Math.max(maximum, row?.length || 0), 0)
  const palette = []
  const indexes = new Map()
  const runs = []
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < width; x++) {
      const tile = rows[y]?.[x] || { type: 'land', ore: false, seedCrystal: false }
      const signature = JSON.stringify(tile)
      let paletteIndex = indexes.get(signature)
      if (paletteIndex === undefined) {
        paletteIndex = palette.length
        indexes.set(signature, paletteIndex)
        palette.push(tile)
      }
      if (runs.at(-1)?.[0] === paletteIndex) runs.at(-1)[1]++
      else runs.push([paletteIndex, 1])
    }
  }
  appendObjectTable(lines, '@mapPalette', palette)
  lines.push(`G|${width}|${rows.length}|${runs.map(([index, count]) => `${index}*${count}`).join(',')}`)
}

function decodeCfb(text) {
  const lines = text.split('\n')
  const meta = lines[1]?.split('|') || []
  const state = {}
  const entityRows = new Map()
  let table = null
  let mapPalette = null

  for (let index = 2; index < lines.length; index++) {
    const parts = lines[index].split('|')
    if (parts[0] === 'S') {
      table = { name: unescapeText(parts[1]), columns: parts.slice(2).map(unescapeText), rows: [] }
      if (table.name === '@mapPalette') mapPalette = table.rows
      else if (table.name.includes(':')) {
        const baseName = table.name.slice(0, table.name.indexOf(':'))
        if (!entityRows.has(baseName)) entityRows.set(baseName, [])
      }
      continue
    }
    if (parts[0] === 'R' && table) {
      const object = {}
      table.columns.forEach((column, columnIndex) => {
        const value = uncell(parts[columnIndex + 1])
        if (value !== undefined) object[column] = value
      })
      table.rows.push(object)
      storeDecodedRow(state, entityRows, table.name, object)
      continue
    }
    if (parts[0] === 'G') restoreMap(state, mapPalette || [], parts)
  }

  for (const [name, rows] of entityRows) state[name] = rows.sort((a, b) => a.index - b.index).map(row => row.value)
  return { label: uncell(meta[1]) || 'Unnamed', time: uncell(meta[2]), state: JSON.stringify(state) }
}

function storeDecodedRow(state, entityRows, name, object) {
  if (name === '@mapPalette') return
  if (name.includes(':')) {
    const baseName = name.slice(0, name.indexOf(':'))
    const index = object['@index'] ?? Number.MAX_SAFE_INTEGER
    delete object['@index']
    if (!entityRows.has(baseName)) entityRows.set(baseName, [])
    entityRows.get(baseName).push({ index, value: unwrapValue(object) })
  } else {
    state[name] = unwrapValue(object)
  }
}

function unwrapValue(object) {
  return Object.keys(object).length === 1 && Object.hasOwn(object, 'value') ? object.value : object
}

function restoreMap(state, palette, parts) {
  const width = Number(parts[1]) || 0
  const height = Number(parts[2]) || 0
  const flat = []
  for (const run of (parts[3] || '').split(',')) {
    const [paletteIndex, count] = run.split('*').map(Number)
    for (let index = 0; index < count; index++) flat.push(cloneValue(palette[paletteIndex] || { type: 'land' }))
  }
  state.mapTileState = Array.from({ length: height }, (_unused, y) => flat.slice(y * width, (y + 1) * width))
  state.mapGridTypes = state.mapTileState.map(row => row.map(tile => tile.type || 'land'))
  state.orePositions = []
  state.mapTileState.forEach((row, y) => row.forEach((tile, x) => { if (tile.ore) state.orePositions.push({ x, y }) }))
}

function cell(value) {
  if (value === undefined) return ''
  if (value === null) return '~'
  if (value === true) return '!'
  if (value === false) return '?'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapeText(value)}`
  return `:${escapeText(pack(value))}`
}

function uncell(value = '') {
  if (value === '') return undefined
  if (value === '~') return null
  if (value === '!') return true
  if (value === '?') return false
  if (value[0] === "'") return unescapeText(value.slice(1))
  if (value[0] === ':') return unpack(unescapeText(value.slice(1))).value
  const number = Number(value)
  return Number.isNaN(number) ? unescapeText(value) : number
}

function escapeText(value) {
  return encodeURIComponent(String(value)).replaceAll('%20', '+')
}

function unescapeText(value = '') {
  return decodeURIComponent(value.replaceAll('+', '%20'))
}

function parseState(state) {
  if (typeof state === 'string') return JSON.parse(state)
  return state && typeof state === 'object' ? state : {}
}

function isVersionOneCompactSave(value) {
  return value?.format === 'code-for-battle-save' && value?.state && typeof value.state === 'object'
}

function decodeVersionOne(saveObject) {
  const state = { ...(saveObject.state || {}) }
  if (state.map) {
    const flat = []
    for (const [paletteIndex, count] of state.map.runs || []) {
      for (let index = 0; index < count; index++) flat.push(cloneValue(state.map.palette[paletteIndex]))
    }
    state.mapTileState = Array.from({ length: state.map.height }, (_unused, y) => flat.slice(y * state.map.width, (y + 1) * state.map.width))
    state.mapGridTypes = state.mapTileState.map(row => row.map(tile => tile.type || 'land'))
    state.orePositions = []
    state.mapTileState.forEach((row, y) => row.forEach((tile, x) => { if (tile.ore) state.orePositions.push({ x, y }) }))
    delete state.map
  }
  return { label: saveObject.label, time: saveObject.time, state: JSON.stringify(state) }
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function pack(value) {
  if (value === undefined) return 'u'
  if (value === null) return 'n'
  if (value === true) return 't'
  if (value === false) return 'f'
  if (typeof value === 'number') return `d${value};`
  if (typeof value === 'string') return `s${value.length}:${value}`
  if (Array.isArray(value)) return `a${value.length}:${value.map(item => frame(pack(item))).join('')}`
  const entries = Object.entries(value)
  return `o${entries.length}:${entries.map(([key, item]) => `${frame(key)}${frame(pack(item))}`).join('')}`
}

function frame(value) {
  return `${value.length}:${value}`
}

function unpack(source, offset = 0) {
  const type = source[offset++]
  if (type === 'u') return { value: undefined, offset }
  if (type === 'n') return { value: null, offset }
  if (type === 't') return { value: true, offset }
  if (type === 'f') return { value: false, offset }
  if (type === 'd') {
    const end = source.indexOf(';', offset)
    return { value: Number(source.slice(offset, end)), offset: end + 1 }
  }
  if (type === 's') {
    const length = readLength(source, offset)
    const start = length.offset
    return { value: source.slice(start, start + length.value), offset: start + length.value }
  }
  const count = readLength(source, offset)
  offset = count.offset
  if (type === 'a') {
    const value = []
    for (let index = 0; index < count.value; index++) {
      const framed = readFrame(source, offset)
      value.push(unpack(framed.value).value)
      offset = framed.offset
    }
    return { value, offset }
  }
  const value = {}
  for (let index = 0; index < count.value; index++) {
    const key = readFrame(source, offset)
    const item = readFrame(source, key.offset)
    value[key.value] = unpack(item.value).value
    offset = item.offset
  }
  return { value, offset }
}

function readLength(source, offset) {
  const end = source.indexOf(':', offset)
  return { value: Number(source.slice(offset, end)), offset: end + 1 }
}

function readFrame(source, offset) {
  const length = readLength(source, offset)
  return { value: source.slice(length.offset, length.offset + length.value), offset: length.offset + length.value }
}
