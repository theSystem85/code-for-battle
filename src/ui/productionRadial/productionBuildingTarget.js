import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { isProductionBuildingType } from './productionCatalog.js'

function ownsBuilding(building, owner) {
  if (!building || !(building.health > 0)) return false
  if (building.owner === owner) return true
  return owner === 'player1' && building.owner === 'player'
}

export function findOwnedProductionBuildingAt(worldX, worldY, options = {}) {
  const buildings = options.buildings || gameState.buildings || []
  const factories = options.factories || gameState.factories || []
  const owner = options.owner || gameState.humanPlayer || 'player1'
  const tileX = Math.floor(worldX / TILE_SIZE)
  const tileY = Math.floor(worldY / TILE_SIZE)
  const seen = new Set()
  const candidates = []
  const push = (building) => {
    if (!building || seen.has(building)) return
    seen.add(building)
    candidates.push(building)
  }
  for (let i = buildings.length - 1; i >= 0; i -= 1) push(buildings[i])
  for (let i = factories.length - 1; i >= 0; i -= 1) push(factories[i])

  for (let i = 0; i < candidates.length; i += 1) {
    const building = candidates[i]
    if (!ownsBuilding(building, owner)) continue
    if (!isProductionBuildingType(building.type)) continue
    const width = building.width || 1
    const height = building.height || 1
    if (tileX >= building.x && tileX < building.x + width && tileY >= building.y && tileY < building.y + height) {
      return building
    }
  }
  return null
}

export function findOwnedProductionBuildingFromClient(clientX, clientY, canvas, options = {}) {
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return null
  const rect = canvas.getBoundingClientRect()
  const scroll = options.scrollOffset || gameState.scrollOffset || { x: 0, y: 0 }
  const worldX = clientX - rect.left + (scroll.x || 0)
  const worldY = clientY - rect.top + (scroll.y || 0)
  return findOwnedProductionBuildingAt(worldX, worldY, options)
}

export function productionBuildingAnchor(building, canvas, options = {}) {
  const rect = canvas.getBoundingClientRect()
  const scroll = options.scrollOffset || gameState.scrollOffset || { x: 0, y: 0 }
  const worldX = (building.x + (building.width || 1) / 2) * TILE_SIZE
  const worldY = (building.y + (building.height || 1) / 2) * TILE_SIZE
  return {
    x: worldX - (scroll.x || 0) + rect.left,
    y: worldY - (scroll.y || 0) + rect.top
  }
}

export function productionMenuRadius(building, buttonSize) {
  const halfW = ((building.width || 1) * TILE_SIZE) / 2
  const halfH = ((building.height || 1) * TILE_SIZE) / 2
  return Math.max(96, Math.hypot(halfW, halfH) + buttonSize * 0.2)
}
