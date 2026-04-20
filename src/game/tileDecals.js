import { TILE_SIZE } from '../config.js'

const DECAL_TAGS = new Set(['impact', 'crater', 'debris'])
const DEFAULT_SEED = 1
const WATER_BLOCKED_DECAL_TAGS = new Set(['impact', 'crater'])

function shouldPreserveExistingDecal(existingTag, nextTag) {
  return existingTag === 'crater' && nextTag === 'impact'
}

function toSeedNumber(seedValue) {
  if (typeof seedValue === 'number' && Number.isFinite(seedValue)) {
    return Math.abs(Math.floor(seedValue)) || DEFAULT_SEED
  }

  const seedText = seedValue != null ? String(seedValue) : ''
  if (!seedText) return DEFAULT_SEED

  let hash = 0
  for (let i = 0; i < seedText.length; i++) {
    hash = ((hash << 5) - hash + seedText.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || DEFAULT_SEED
}

function mixHash(value) {
  let hash = value >>> 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

function hashTag(tag = '') {
  let hash = 2166136261
  for (let i = 0; i < tag.length; i++) {
    hash ^= tag.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getTileForDecal(mapGrid, tileX, tileY) {
  if (!Array.isArray(mapGrid) || tileX < 0 || tileY < 0) return null
  return mapGrid[tileY]?.[tileX] || null
}

export function setTileDecal(mapGrid, gameState, tileX, tileY, tag, options = null) {
  if (!DECAL_TAGS.has(tag)) return null

  const tile = getTileForDecal(mapGrid, tileX, tileY)
  if (!tile) return null
  if (tile.type === 'water' && WATER_BLOCKED_DECAL_TAGS.has(tag)) return null

  if (shouldPreserveExistingDecal(tile.decal?.tag, tag)) {
    return tile.decal
  }

  const previousCounter = Number.isFinite(tile.decalCounter) ? tile.decalCounter : 0
  const nextCounter = previousCounter + 1
  tile.decalCounter = nextCounter

  const mapSeed = toSeedNumber(gameState?.mapSeed)
  const seedInput = (
    mapSeed ^
    Math.imul(tileX + 1, 374761393) ^
    Math.imul(tileY + 1, 668265263) ^
    Math.imul(nextCounter, 2246822519) ^
    hashTag(tag)
  ) >>> 0

  const variantSeed = mixHash(seedInput)
  tile.decal = {
    tag,
    variantSeed,
    footprint: options?.footprint || null
  }

  return tile.decal
}

export function setWorldDecal(mapGrid, gameState, worldX, worldY, tag) {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null
  const tileX = Math.floor(worldX / TILE_SIZE)
  const tileY = Math.floor(worldY / TILE_SIZE)
  return setTileDecal(mapGrid, gameState, tileX, tileY, tag)
}

export function setBuildingDebrisDecals(mapGrid, gameState, buildingLike) {
  if (!buildingLike) return
  const startX = Number.isFinite(buildingLike.x) ? Math.floor(buildingLike.x) : 0
  const startY = Number.isFinite(buildingLike.y) ? Math.floor(buildingLike.y) : 0
  const width = Math.max(1, Math.floor(buildingLike.width || 1))
  const height = Math.max(1, Math.floor(buildingLike.height || 1))

  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      setTileDecal(mapGrid, gameState, x, y, 'debris', {
        footprint: {
          originX: startX,
          originY: startY,
          width,
          height
        }
      })
    }
  }
}

export function getTileDecalSignature(tile) {
  if (!tile?.decal || typeof tile.decal !== 'object') return 'none'
  const tag = DECAL_TAGS.has(tile.decal.tag) ? tile.decal.tag : 'none'
  const variantSeed = Number.isFinite(tile.decal.variantSeed)
    ? tile.decal.variantSeed
    : 0
  return `${tag}:${variantSeed}`
}
