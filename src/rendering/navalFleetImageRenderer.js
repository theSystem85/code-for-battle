import { TILE_SIZE } from '../config.js'
import { getNavalRenderLengthTiles } from '../utils/navalUtils.js'

const SOUTH_FACING_SOURCE_ANGLE = Math.PI / 2
const IMAGE_PATHS = Object.freeze({
  hovercraft: 'images/map/units/hovercraft_map.webp',
  vehicleFerry: 'images/map/units/vehicle_ferry_map.webp',
  aircraftCarrier: 'images/map/units/aircraft_carrier_map.webp',
  navalMineLayer: 'images/map/units/naval_mine_layer_map.webp',
  battleship: 'images/map/units/battleship_map.webp',
  submarine: 'images/map/units/submarine_map.webp'
})

const imageStates = new Map()

function getImageState(type) {
  if (!imageStates.has(type)) {
    imageStates.set(type, { image: null, loaded: false, loading: false })
  }
  return imageStates.get(type)
}

export function preloadNavalFleetImage(type) {
  const path = IMAGE_PATHS[type]
  if (!path) return
  const state = getImageState(type)
  if (state.loaded || state.loading || typeof Image === 'undefined') return
  state.loading = true
  state.image = new Image()
  state.image.onload = () => {
    state.loaded = true
    state.loading = false
  }
  state.image.onerror = () => {
    state.loaded = false
    state.loading = false
  }
  state.image.src = path
}

export function isNavalFleetImageLoaded(type) {
  const state = getImageState(type)
  return Boolean(state.loaded && state.image?.complete)
}

function getSubmarineOpacity(unit, viewerOwner) {
  if (unit.type !== 'submarine') return 1
  if (unit.depthState === 'submerged') {
    return unit.owner === viewerOwner || (viewerOwner === 'player1' && unit.owner === 'player') ? 0.3 : 0
  }
  if (unit.depthState === 'surfacing') {
    return Math.max(0.3, Math.min(1, unit.depthTransitionProgress || 0))
  }
  if (unit.depthState === 'submerging') {
    return Math.max(0.3, 1 - (unit.depthTransitionProgress || 0) * 0.7)
  }
  return 1
}

export function renderNavalFleetUnit(ctx, unit, centerX, centerY, viewerOwner) {
  if (!IMAGE_PATHS[unit?.type]) return false
  if (!isNavalFleetImageLoaded(unit.type)) {
    preloadNavalFleetImage(unit.type)
    return false
  }

  const state = getImageState(unit.type)
  const image = state.image
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const scale = (TILE_SIZE * getNavalRenderLengthTiles(unit.type)) / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  const direction = unit.direction || unit.rotation || 0
  const opacity = getSubmarineOpacity(unit, viewerOwner)
  if (opacity <= 0) return true

  ctx.save()
  ctx.globalAlpha *= opacity
  ctx.translate(centerX, centerY)
  ctx.rotate(direction - SOUTH_FACING_SOURCE_ANGLE)

  if (unit.type === 'submarine' && (unit.depthState === 'surfacing' || unit.depthState === 'submerging')) {
    const progress = unit.depthState === 'surfacing'
      ? Math.max(0.05, unit.depthTransitionProgress || 0)
      : Math.max(0.05, 1 - (unit.depthTransitionProgress || 0))
    ctx.beginPath()
    ctx.rect(-width / 2, -height / 2, width, height * progress)
    ctx.clip()
  }

  ctx.drawImage(image, -width / 2, -height / 2, width, height)
  ctx.restore()
  return true
}

export function getNavalBatteryWorldPoint(unit, batteryName) {
  const direction = unit.direction || unit.rotation || 0
  const longitudinal = batteryName === 'fore' ? 1.35 : -1.15
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  return {
    x: centerX + Math.cos(direction) * TILE_SIZE * longitudinal,
    y: centerY + Math.sin(direction) * TILE_SIZE * longitudinal
  }
}
