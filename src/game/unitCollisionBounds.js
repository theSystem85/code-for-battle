import { TILE_SIZE } from '../config.js'

const FALLBACK_BOUNDS = Object.freeze({ minX: 0, minY: 0, maxX: TILE_SIZE, maxY: TILE_SIZE })
const collisionBoundsByUnitType = new Map()
let initialized = false

const UNIT_COLLISION_ASSET_MAP = Object.freeze({
  tank_v1: 'images/map/units/tankV1_wagon.webp',
  'tank-v2': 'images/map/units/tankV2_wagon.webp',
  tank_v2: 'images/map/units/tankV2_wagon.webp',
  'tank-v3': 'images/map/units/tankV3_wagon.webp',
  tank_v3: 'images/map/units/tankV3_wagon.webp',
  harvester: 'images/map/units/harvester.webp',
  rocketTank: 'images/map/units/rocket_tank.webp',
  recoveryTank: 'images/map/units/recovery_tank.webp',
  ambulance: 'images/map/units/ambulance.webp',
  tankerTruck: 'images/map/units/tanker_truck.webp',
  ammunitionTruck: 'images/map/units/ammunition_truck_map.webp',
  mineLayer: 'images/map/units/mine_layer_map.webp',
  mineSweeper: 'images/map/units/minesweeper_map.webp',
  howitzer: 'images/map/units/howitzer_map.webp',
  apache: 'images/map/units/apache_body_map.webp'
})

function normalizeBounds(rawBounds) {
  if (!rawBounds || typeof rawBounds !== 'object') {
    return null
  }

  const minX = Number(rawBounds.minX)
  const minY = Number(rawBounds.minY)
  const maxX = Number(rawBounds.maxX)
  const maxY = Number(rawBounds.maxY)

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return null
  }

  const clamped = {
    minX: Math.max(0, Math.min(TILE_SIZE, minX)),
    minY: Math.max(0, Math.min(TILE_SIZE, minY)),
    maxX: Math.max(0, Math.min(TILE_SIZE, maxX)),
    maxY: Math.max(0, Math.min(TILE_SIZE, maxY))
  }

  if (clamped.maxX <= clamped.minX || clamped.maxY <= clamped.minY) {
    return null
  }

  return clamped
}

function loadBoundsFromDataFile(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.unitBounds !== 'object') {
    return false
  }

  let loadedAny = false
  Object.entries(payload.unitBounds).forEach(([unitType, rawBounds]) => {
    const normalized = normalizeBounds(rawBounds)
    if (normalized) {
      collisionBoundsByUnitType.set(unitType, normalized)
      loadedAny = true
    }
  })

  return loadedAny
}

function computeBoundsFromImage(image) {
  const sourceWidth = image?.naturalWidth || image?.width || 0
  const sourceHeight = image?.naturalHeight || image?.height || 0
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return null
  }

  ctx.clearRect(0, 0, sourceWidth, sourceHeight)
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, sourceWidth, sourceHeight)
  const alpha = imageData.data

  let minX = sourceWidth
  let minY = sourceHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const alphaIndex = ((y * sourceWidth) + x) * 4 + 3
      if (alpha[alphaIndex] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  const scale = TILE_SIZE / Math.max(sourceWidth, sourceHeight)
  return normalizeBounds({
    minX: minX * scale,
    minY: minY * scale,
    maxX: (maxX + 1) * scale,
    maxY: (maxY + 1) * scale
  })
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

async function computeRuntimeBoundsIfNeeded() {
  const entries = Object.entries(UNIT_COLLISION_ASSET_MAP)

  for (const [unitType, assetPath] of entries) {
    if (collisionBoundsByUnitType.has(unitType)) continue
    const image = await loadImage(assetPath)
    if (!image) continue
    const bounds = computeBoundsFromImage(image)
    if (bounds) {
      collisionBoundsByUnitType.set(unitType, bounds)
    }
  }
}

export async function initializeUnitCollisionBounds() {
  if (initialized) return

  try {
    const response = await fetch('data/unit-collision-bounds.json', { cache: 'no-store' })
    if (response.ok) {
      const payload = await response.json()
      loadBoundsFromDataFile(payload)
    }
  } catch {
    // Optional precomputed file may not exist in development or older builds.
  }

  await computeRuntimeBoundsIfNeeded()
  initialized = true
}

export function getUnitCollisionBounds(unitType) {
  const bounds = collisionBoundsByUnitType.get(unitType)
  return bounds || FALLBACK_BOUNDS
}

export function getUnitCollisionBoxAt(unit, x = unit?.x || 0, y = unit?.y || 0) {
  const localBounds = getUnitCollisionBounds(unit?.type)
  return {
    minX: x + localBounds.minX,
    minY: y + localBounds.minY,
    maxX: x + localBounds.maxX,
    maxY: y + localBounds.maxY,
    width: localBounds.maxX - localBounds.minX,
    height: localBounds.maxY - localBounds.minY
  }
}
