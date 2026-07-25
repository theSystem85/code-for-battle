import { MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE, RECOIL_DISTANCE, RECOIL_DURATION, TILE_SIZE } from '../config.js'
import {
  BATTLESHIP_TURRET_NAMES,
  getBattleshipTurretBlockedArc,
  getBattleshipTurretLocalPoint
} from '../game/battleshipTurrets.js'
import { gameState } from '../gameState.js'
import { getSimulationTime } from '../game/time.js'
import { getNavalRenderLengthTiles } from '../utils/navalUtils.js'

const SOUTH_FACING_SOURCE_ANGLE = Math.PI / 2
const IMAGE_PATHS = Object.freeze({
  hovercraft: 'images/map/units/hovercraft_map.webp',
  vehicleFerry: 'images/map/units/vehicle_ferry_map.webp',
  aircraftCarrier: 'images/map/units/aircraft_carrier_map.webp',
  navalMineLayer: 'images/map/units/naval_mine_layer_map.webp',
  battleship: 'images/map/units/battleship_map.webp',
  battleshipTurret: 'images/map/units/battleship_turret.webp',
  battleshipBarrel: 'images/map/units/battleship_barrel.webp',
  submarine: 'images/map/units/submarine_map.webp'
})

const imageStates = new Map()
const BATTLESHIP_IMAGE_KEYS = Object.freeze(['battleship', 'battleshipTurret', 'battleshipBarrel'])

function getImageState(type) {
  if (!imageStates.has(type)) {
    imageStates.set(type, { image: null, loaded: false, loading: false })
  }
  return imageStates.get(type)
}

export function preloadNavalFleetImage(type) {
  const keys = type === 'battleship'
    ? BATTLESHIP_IMAGE_KEYS
    : [type]
  keys.forEach(key => preloadNavalFleetImageLayer(key))
}

function preloadNavalFleetImageLayer(key) {
  const path = IMAGE_PATHS[key]
  if (!path) return
  const state = getImageState(key)
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
  if (type !== 'battleship') {
    const state = getImageState(type)
    return Boolean(state.loaded && state.image?.complete)
  }
  for (const key of BATTLESHIP_IMAGE_KEYS) {
    const state = getImageState(key)
    if (!state.loaded || !state.image?.complete) return false
  }
  return true
}

export function getNavalFleetBaseImage(type) {
  return isNavalFleetImageLoaded(type) ? getImageState(type).image : null
}

function getRecoilOffset(startTime, now) {
  if (!Number.isFinite(startTime) || now - startTime > RECOIL_DURATION) return 0
  const progress = Math.max(0, (now - startTime) / RECOIL_DURATION)
  const easedProgress = 1 - Math.pow(1 - progress, 3)
  return RECOIL_DISTANCE * (1 - easedProgress)
}

function renderBattleshipMuzzleFlash(ctx, x, y, startTime, now) {
  if (!Number.isFinite(startTime) || now - startTime > MUZZLE_FLASH_DURATION) return
  const progress = Math.max(0, (now - startTime) / MUZZLE_FLASH_DURATION)
  const alpha = 1 - progress
  const size = MUZZLE_FLASH_SIZE * 1.25 * (1 - progress * 0.5)
  ctx.save()
  ctx.globalAlpha *= alpha
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size)
  gradient.addColorStop(0, '#fff')
  gradient.addColorStop(0.28, '#fff36a')
  gradient.addColorStop(0.65, '#ff8a22')
  gradient.addColorStop(1, 'rgba(255, 90, 0, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function renderBattleshipFiringArc(ctx, unit, name, x, y) {
  const blockedArc = getBattleshipTurretBlockedArc(unit, name)
  if (!blockedArc) return
  const radius = TILE_SIZE * 0.72
  ctx.save()
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.strokeStyle = 'rgba(92, 255, 128, 0.78)'
  ctx.beginPath()
  ctx.arc(x, y, radius, blockedArc.centerAngle + blockedArc.halfAngle, blockedArc.centerAngle - blockedArc.halfAngle + Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(255, 58, 42, 0.16)'
  ctx.strokeStyle = 'rgba(255, 78, 52, 0.9)'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, radius, blockedArc.centerAngle - blockedArc.halfAngle, blockedArc.centerAngle + blockedArc.halfAngle)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function renderBattleshipLayers(ctx, unit, centerX, centerY, opacity) {
  const turretImage = getImageState('battleshipTurret').image
  const barrelImage = getImageState('battleshipBarrel').image
  const now = getSimulationTime(gameState)
  const direction = unit.direction || unit.rotation || 0

  for (const name of BATTLESHIP_TURRET_NAMES) {
    const turret = unit.batteries?.[name]
    if (!turret || turret.enabled === false) continue
    const localPoint = getBattleshipTurretLocalPoint(name)
    const x = centerX + Math.cos(direction) * localPoint.y
    const y = centerY + Math.sin(direction) * localPoint.y
    const turretDirection = Number.isFinite(turret.direction) ? turret.direction : direction
    const turretSize = TILE_SIZE * 0.78
    const barrelHeight = TILE_SIZE * 1.02
    const barrelWidth = barrelHeight * ((barrelImage.naturalWidth || barrelImage.width) / (barrelImage.naturalHeight || barrelImage.height))

    ctx.save()
    ctx.globalAlpha *= opacity
    ctx.translate(x, y)
    ctx.rotate(turretDirection - SOUTH_FACING_SOURCE_ANGLE)
    ctx.drawImage(turretImage, -turretSize / 2, -turretSize / 2, turretSize, turretSize)
    for (let barrelIndex = 0; barrelIndex < 2; barrelIndex++) {
      const side = barrelIndex === 0 ? -1 : 1
      const recoil = getRecoilOffset(turret.barrelRecoilStartTimes?.[barrelIndex], now)
      const barrelX = side * TILE_SIZE * 0.105
      const barrelY = -TILE_SIZE * 0.12 - recoil
      ctx.drawImage(barrelImage, barrelX - barrelWidth / 2, barrelY, barrelWidth, barrelHeight)
      renderBattleshipMuzzleFlash(
        ctx,
        barrelX,
        barrelY + barrelHeight * 0.96,
        turret.muzzleFlashStartTimes?.[barrelIndex],
        now
      )
    }
    ctx.restore()
  }

  if (!unit.selected) return
  for (const name of BATTLESHIP_TURRET_NAMES) {
    if (unit.selectedTurret && unit.selectedTurret !== name) continue
    if (unit.batteries?.[name]?.enabled === false) continue
    const point = getBattleshipTurretLocalPoint(name)
    const x = centerX + Math.cos(direction) * point.y
    const y = centerY + Math.sin(direction) * point.y
    renderBattleshipFiringArc(ctx, unit, name, x, y)
    if (unit.selectedTurret === name) {
      ctx.save()
      ctx.strokeStyle = '#ffe46a'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, TILE_SIZE * 0.42, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }
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
  if (unit.type === 'battleship') renderBattleshipLayers(ctx, unit, centerX, centerY, opacity)
  return true
}
