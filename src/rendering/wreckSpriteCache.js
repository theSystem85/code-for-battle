import { getTankImageAssets } from './tankImageRenderer.js'
import { getHarvesterBaseImage } from './harvesterImageRenderer.js'
import { getRocketTankBaseImage } from './rocketTankImageRenderer.js'
import { getAmbulanceBaseImage } from './ambulanceImageRenderer.js'
import { getTankerTruckBaseImage } from './tankerTruckImageRenderer.js'
import { getRecoveryTankBaseImage } from './recoveryTankImageRenderer.js'
import { getHowitzerBaseImage } from './howitzerImageRenderer.js'
import { getMineLayerBaseImage } from './mineLayerImageRenderer.js'
import { getMineSweeperBaseImage } from './mineSweeperImageRenderer.js'
import { getF22BaseImage } from './f22ImageRenderer.js'
import { getF35BaseImage } from './f35ImageRenderer.js'
import { TILE_SIZE } from '../config.js'

const EFFECTS_RASTER_BYTE_LIMIT = 16 * 1024 * 1024
const grayscaleCache = new Map()
const preparedWreckCache = new Map()
let cachedBytes = 0
let accessSequence = 0

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createNoiseValue(index, seed = 0) {
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233)
  const fract = x - Math.floor(x)
  return fract * 2 - 1
}

function getDesaturatedCanvas(image) {
  if (!image || !image.width || !image.height) {
    return null
  }

  const existing = grayscaleCache.get(image)
  if (existing) {
    existing.lastUsed = ++accessSequence
    return existing.canvas
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)

  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = imageData
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha === 0) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b
      const noise = createNoiseValue(i / 4, luminance)
      const value = clamp(luminance + noise * 18, 0, 255)
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
    }
    ctx.putImageData(imageData, 0, 0)
  } catch (e) {
    window.logger.warn('Failed to process wreck image for grayscale', e)
  }

  storeCacheEntry(grayscaleCache, image, canvas, canvas.width * canvas.height * 4)
  return canvas
}

function storeCacheEntry(cache, key, canvas, bytes, metadata = null) {
  while (cachedBytes + bytes > EFFECTS_RASTER_BYTE_LIMIT) {
    let oldestCache = null
    let oldestKey = null
    let oldestSequence = Infinity
    for (const candidateCache of [grayscaleCache, preparedWreckCache]) {
      for (const [candidateKey, entry] of candidateCache) {
        if (entry.lastUsed < oldestSequence) {
          oldestSequence = entry.lastUsed
          oldestCache = candidateCache
          oldestKey = candidateKey
        }
      }
    }
    if (!oldestCache) return null
    const evicted = oldestCache.get(oldestKey)
    cachedBytes -= evicted.bytes
    oldestCache.delete(oldestKey)
  }
  const entry = { canvas, bytes, lastUsed: ++accessSequence, ...metadata }
  cache.set(key, entry)
  cachedBytes += bytes
  return entry
}

function prepareFinalSizeSprite(key, source, logicalWidth, logicalHeight, density = 1) {
  if (!source || logicalWidth <= 0 || logicalHeight <= 0) return null
  const safeDensity = Number.isFinite(density) && density > 0 ? density : 1
  const cacheKey = `${key}@${safeDensity}`
  const existing = preparedWreckCache.get(cacheKey)
  if (existing) {
    existing.lastUsed = ++accessSequence
    return existing
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(logicalWidth * safeDensity))
  canvas.height = Math.max(1, Math.round(logicalHeight * safeDensity))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return storeCacheEntry(
    preparedWreckCache,
    cacheKey,
    canvas,
    canvas.width * canvas.height * 4,
    { logicalWidth, logicalHeight, density: safeDensity }
  )
}

export function getTankWreckCanvases(unitType) {
  const assets = getTankImageAssets(unitType)
  if (!assets) return null
  return {
    wagon: getDesaturatedCanvas(assets.wagon),
    turret: getDesaturatedCanvas(assets.turret),
    barrel: getDesaturatedCanvas(assets.barrel)
  }
}

export function getSingleImageWreckSprite(unitType) {
  let image = null
  switch (unitType) {
    case 'harvester':
      image = getHarvesterBaseImage()
      break
    case 'rocketTank':
      image = getRocketTankBaseImage()
      break
    case 'ambulance':
      image = getAmbulanceBaseImage()
      break
    case 'tankerTruck':
      image = getTankerTruckBaseImage()
      break
    case 'recoveryTank':
      image = getRecoveryTankBaseImage()
      break
    case 'howitzer':
      image = getHowitzerBaseImage()
      break
    case 'mineLayer':
      image = getMineLayerBaseImage()
      break
    case 'mineSweeper':
      image = getMineSweeperBaseImage()
      break
    case 'f22Raptor':
      image = getF22BaseImage()
      break
    case 'f35':
      image = getF35BaseImage()
      break
    default:
      image = null
      break
  }

  if (!image) {
    return null
  }
  return getDesaturatedCanvas(image)
}

export function getPreparedSingleImageWreckSprite(unitType, density = 1) {
  const source = getSingleImageWreckSprite(unitType)
  if (!source) return null
  const scale = TILE_SIZE / Math.max(source.width, source.height)
  return prepareFinalSizeSprite(
    `single:${unitType}`,
    source,
    source.width * scale,
    source.height * scale,
    density
  )
}

export function getPreparedSinkingWreckSprite(unitType, source, spriteLengthTiles, density = 1) {
  if (!source) return null
  const sourceWidth = source.naturalWidth || source.width
  const sourceHeight = source.naturalHeight || source.height
  const scale = (TILE_SIZE * spriteLengthTiles) / Math.max(sourceWidth, sourceHeight)
  return prepareFinalSizeSprite(
    `sinking:${unitType}`,
    source,
    sourceWidth * scale,
    sourceHeight * scale,
    density
  )
}

export function getCachedPreparedSinkingWreckSprite(unitType, density = 1) {
  const safeDensity = Number.isFinite(density) && density > 0 ? density : 1
  const entry = preparedWreckCache.get(`sinking:${unitType}@${safeDensity}`) || null
  if (entry) entry.lastUsed = ++accessSequence
  return entry
}

export function prewarmWreckSpriteCache(density = 1) {
  for (const unitType of [
    'harvester', 'rocketTank', 'ambulance', 'tankerTruck', 'recoveryTank',
    'howitzer', 'mineLayer', 'mineSweeper', 'f22Raptor', 'f35'
  ]) {
    getPreparedSingleImageWreckSprite(unitType, density)
  }
  for (const tankType of ['tank_v1', 'tank-v2', 'tank_v2', 'tank-v3', 'tank_v3']) {
    getTankWreckCanvases(tankType)
  }
}

export function getWreckSpriteCacheStats() {
  return {
    bytes: cachedBytes,
    limitBytes: EFFECTS_RASTER_BYTE_LIMIT,
    entries: grayscaleCache.size + preparedWreckCache.size
  }
}
