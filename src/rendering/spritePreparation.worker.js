import { buildBlackKeySeedMask, applyEdgeConnectedBlackKey } from './blackKeyPixels.js'
import { createSpriteWorkerResult, SPRITE_WORKER_RESULT_KINDS } from './spriteStreamingProtocol.js'

function result(request, kind, payload = null, errorCode = null) {
  return createSpriteWorkerResult({ requestId: request.requestId, kind, generations: request.generations, payload, errorCode })
}

function groupsFromMetadata(metadata) {
  const groups = new Map()
  for (const [key, tile] of Object.entries(metadata?.tiles || {})) {
    const tag = tile.tags?.find(value => /^group_\d+$/.test(value))
    if (!tag || !tile.rect) continue
    const [fallbackCol, fallbackRow] = key.split(',').map(Number)
    const member = { ...tile, col: tile.col ?? fallbackCol, row: tile.row ?? fallbackRow }
    if (!groups.has(tag)) groups.set(tag, [])
    groups.get(tag).push(member)
  }
  return groups
}

function median(values) {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] || 0
}

function cutoutGroupGround(pixels, width, height, innerCuts) {
  const { data } = pixels
  const channels = [[], [], []]
  const sample = (x, y) => {
    const offset = ((y * width) + x) * 4
    if (data[offset + 3] < 200) return
    for (let channel = 0; channel < 3; channel++) channels[channel].push(data[offset + channel])
  }
  for (let x = 0; x < width; x += 2) { sample(x, 0); sample(x, height - 1) }
  for (let y = 0; y < height; y += 2) { sample(0, y); sample(width - 1, y) }
  const ground = channels.map(median)
  const distance = index => Math.hypot(data[index * 4] - ground[0], data[index * 4 + 1] - ground[1], data[index * 4 + 2] - ground[2])
  const reached = new Uint8Array(width * height); const queue = new Int32Array(width * height)
  let head = 0; let tail = 0
  const visit = index => {
    if (!reached[index] && (!data[index * 4 + 3] || distance(index) < 48)) { reached[index] = 1; queue[tail++] = index }
  }
  if (innerCuts) { for (let index = 0; index < reached.length; index++) visit(index) } else {
    for (let x = 0; x < width; x++) { visit(x); visit(((height - 1) * width) + x) }
    for (let y = 0; y < height; y++) { visit(y * width); visit((y * width) + width - 1) }
    while (head < tail) {
      const index = queue[head++]; const x = index % width
      if (x) visit(index - 1); if (x + 1 < width) visit(index + 1)
      if (index >= width) visit(index - width); if (index + width < reached.length) visit(index + width)
    }
  }
  for (let index = 0; index < reached.length; index++) {
    if (!reached[index]) continue
    const t = Math.max(0, Math.min(1, (distance(index) - 18) / 30))
    data[index * 4 + 3] = Math.round(data[index * 4 + 3] * t * t * (3 - (2 * t)))
  }
}

async function makeGroupBitmaps(source, metadata, environment) {
  const output = []
  for (const [id, tiles] of groupsFromMetadata(metadata)) {
    const minCol = Math.min(...tiles.map(tile => tile.col)); const minRow = Math.min(...tiles.map(tile => tile.row))
    const maxCol = Math.max(...tiles.map(tile => tile.col)); const maxRow = Math.max(...tiles.map(tile => tile.row))
    const cellWidth = tiles[0].rect.width; const cellHeight = tiles[0].rect.height
    const canvas = new environment.OffscreenCanvas((maxCol - minCol + 1) * cellWidth, (maxRow - minRow + 1) * cellHeight)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    for (const tile of tiles) context.drawImage(source, tile.rect.x, tile.rect.y, tile.rect.width, tile.rect.height, (tile.col - minCol) * cellWidth, (tile.row - minRow) * cellHeight, cellWidth, cellHeight)
    // One group-wide cutout prevents internal cell seams from becoming edges.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    cutoutGroupGround(pixels, canvas.width, canvas.height, tiles.some(tile => tile.tags?.includes('inner_cuts')))
    context.putImageData(pixels, 0, 0)
    output.push({ id, bitmap: await environment.createImageBitmap(canvas), width: canvas.width, height: canvas.height, origin: { col: minCol, row: minRow } })
  }
  return output
}

export async function prepareSpriteSheet(request, environment = globalThis) {
  let source
  try {
    const blob = request.payload?.blob || await environment.fetch(request.payload.url, { credentials: 'same-origin' }).then(response => {
      if (!response.ok) throw new Error(`sprite-fetch-${response.status}`)
      return response.blob()
    })
    source = await environment.createImageBitmap(blob)
    const { width, height } = source
    const maxPixels = request.payload?.maxPixels ?? 16_777_216
    if (!width || !height || width * height > maxPixels) throw new RangeError('sprite-dimensions-invalid')
    const canvas = new environment.OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(source, 0, 0)
    const pixels = context.getImageData(0, 0, width, height)
    const seeds = buildBlackKeySeedMask(width, height, request.payload?.metadata)
    applyEdgeConnectedBlackKey(pixels.data, width, height, request.payload?.cutoffBrightness, request.payload?.softenBrightness, seeds)
    context.putImageData(pixels, 0, 0)
    const groups = await makeGroupBitmaps(canvas, request.payload?.metadata, environment)
    const bitmap = await environment.createImageBitmap(canvas)
    return result(request, SPRITE_WORKER_RESULT_KINDS.COMPLETE, { bitmap, groups, width, height })
  } catch (error) {
    return result(request, SPRITE_WORKER_RESULT_KINDS.ERROR, null, error?.message || 'sprite-preparation-failed')
  } finally {
    source?.close?.()
  }
}

export function installSpritePreparationWorker(scope = globalThis) {
  scope.onmessage = async({ data: request }) => {
    if (request.operation === 'capabilities') {
      scope.postMessage(result(request, SPRITE_WORKER_RESULT_KINDS.CAPABILITIES, {
        offscreenCanvas: typeof scope.OffscreenCanvas === 'function',
        imageBitmap: typeof scope.createImageBitmap === 'function',
        transferableImageBitmap: typeof scope.OffscreenCanvas === 'function' && typeof scope.createImageBitmap === 'function'
      }))
      return
    }
    const response = await prepareSpriteSheet(request, scope)
    const transfers = response.kind === SPRITE_WORKER_RESULT_KINDS.COMPLETE
      ? [response.payload.bitmap, ...response.payload.groups.map(group => group.bitmap)]
      : []
    scope.postMessage(response, transfers)
  }
}

if (typeof globalThis.WorkerGlobalScope !== 'undefined' && globalThis instanceof globalThis.WorkerGlobalScope) installSpritePreparationWorker()
