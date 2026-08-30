import { describe, expect, it } from 'vitest'
import '../setup.js'
import { AI_DECISION_INTERVAL, TILE_SIZE } from '../../src/config.js'
import { updateNavalAIUnit } from '../../src/ai/enemyNavalBehavior.js'

function createWaterMap(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'water', building: null, seedCrystal: false }))
  )
}

function createDestroyer(overrides = {}) {
  return {
    id: 'destroyer-ai',
    owner: 'player2',
    type: 'destroyer',
    isNaval: true,
    x: 20 * TILE_SIZE,
    y: 10 * TILE_SIZE,
    tileX: 20,
    tileY: 10,
    health: 500,
    maxHealth: 500,
    path: [],
    ...overrides
  }
}

describe('enemy naval behavior', () => {
  it('returns below 20% health, waits in the service zone, and resumes its saved target', () => {
    const mapGrid = createWaterMap(40, 30)
    const shipyard = { id: 'yard-ai', type: 'shipyard', owner: 'player2', x: 5, y: 5, width: 5, height: 5, health: 450 }
    const enemyShip = createDestroyer({ id: 'enemy-ship', owner: 'player1', x: 30 * TILE_SIZE, tileX: 30 })
    const unit = createDestroyer({ health: 90, target: enemyShip })
    const state = { buildings: [shipyard], occupancyMap: [] }

    updateNavalAIUnit(unit, [unit, enemyShip], state, mapGrid, 1000, 'player2')

    expect(unit.returningToShipyard).toBe(true)
    expect(unit.shipyardResumeTarget).toBe(enemyShip)
    expect(unit.target).toBeNull()
    expect(unit.allowedToAttack).toBe(false)
    expect(unit.path.length).toBeGreaterThan(0)
    expect(unit.path.every(tile => mapGrid[tile.y][tile.x].type === 'water')).toBe(true)

    unit.x = 10 * TILE_SIZE
    unit.y = 7 * TILE_SIZE
    unit.tileX = 10
    unit.tileY = 7
    unit.health = 495
    unit.path = []
    updateNavalAIUnit(unit, [unit, enemyShip], state, mapGrid, 2000, 'player2')

    expect(unit.returningToShipyard).toBe(false)
    expect(unit.navalAttackTarget).toBe(enemyShip)
    expect(unit.allowedToAttack).toBe(true)
  })

  it('prioritizes enemy ships and stages on water within firing range', () => {
    const mapGrid = createWaterMap(70, 30)
    const unit = createDestroyer({ x: 60 * TILE_SIZE, tileX: 60 })
    const enemyShip = createDestroyer({ id: 'enemy-ship', owner: 'player1', x: 5 * TILE_SIZE, tileX: 5 })
    const enemyBase = { id: 'enemy-base', owner: 'player1', type: 'constructionYard', x: 2, y: 10, width: 3, height: 3, health: 1000 }
    const state = { buildings: [enemyBase], occupancyMap: [] }

    updateNavalAIUnit(unit, [unit, enemyShip], state, mapGrid, 1000, 'player2')

    expect(unit.navalAttackTarget).toBe(enemyShip)
    expect(unit.target).toBeNull()
    expect(unit.path.length).toBeGreaterThan(0)
    const destination = unit.moveTarget
    expect(mapGrid[destination.y][destination.x].type).toBe('water')
    expect(Math.hypot(destination.x - enemyShip.tileX, destination.y - enemyShip.tileY)).toBeLessThanOrEqual(18)
  })

  it('routes depleted ships to a capable supply ship and resumes combat after replenishment', () => {
    const mapGrid = createWaterMap(40, 30)
    const enemyShip = createDestroyer({ id: 'enemy-ship', owner: 'player1', x: 30 * TILE_SIZE, tileX: 30 })
    const supplyShip = createDestroyer({
      id: 'supply', type: 'supplyShip', x: 12 * TILE_SIZE, tileX: 12,
      supplyAmmo: 80, supplyFuel: 1000, supplyRepairTools: 100, supplyCrew: 2
    })
    const unit = createDestroyer({
      ammunition: 0, maxAmmunition: 60, gas: 5000, maxGas: 5000,
      crew: { driver: true, commander: true, loader: true, gunner: true },
      navalAttackTarget: enemyShip
    })
    const state = { buildings: [], occupancyMap: [] }

    updateNavalAIUnit(unit, [unit, supplyShip, enemyShip], state, mapGrid, 1000, 'player2')

    expect(unit.navalServiceMode).toBe('supply')
    expect(unit.navalServiceSupplierId).toBe(supplyShip.id)
    expect(unit.allowedToAttack).toBe(false)
    expect(unit.path.length).toBeGreaterThan(0)

    unit.ammunition = 60
    updateNavalAIUnit(unit, [unit, supplyShip, enemyShip], state, mapGrid, 2000, 'player2')

    expect(unit.navalServiceMode).toBeNull()
    expect(unit.navalAttackTarget).toBe(enemyShip)
    expect(unit.allowedToAttack).toBe(true)
  })

  it('deploys supply ships toward needy fleet members without acquiring attack targets', () => {
    const mapGrid = createWaterMap(40, 30)
    const supplyShip = createDestroyer({
      id: 'supply', type: 'supplyShip', x: 5 * TILE_SIZE, tileX: 5,
      supplyAmmo: 80, maxSupplyAmmo: 80, supplyFuel: 1000, maxSupplyFuel: 1000,
      supplyRepairTools: 100, maxSupplyRepairTools: 100, supplyCrew: 2, maxSupplyCrew: 2
    })
    const needyShip = createDestroyer({
      id: 'needy', x: 25 * TILE_SIZE, tileX: 25,
      ammunition: 0, maxAmmunition: 60
    })

    updateNavalAIUnit(supplyShip, [supplyShip, needyShip], { buildings: [], occupancyMap: [] }, mapGrid, 1000, 'player2')

    expect(supplyShip.allowedToAttack).toBe(false)
    expect(supplyShip.navalAttackTarget).toBeNull()
    expect(supplyShip.path.length).toBeGreaterThan(0)
  })

  it('throttles retries when an attack target is unreachable across disconnected water', () => {
    const mapGrid = Array.from({ length: 20 }, () =>
      Array.from({ length: 30 }, () => ({ type: 'land', building: null, seedCrystal: false })))
    for (let y = 8; y <= 12; y++) {
      for (let x = 1; x <= 4; x++) mapGrid[y][x].type = 'water'
      for (let x = 22; x <= 27; x++) mapGrid[y][x].type = 'water'
    }
    const unit = createDestroyer({ x: 2 * TILE_SIZE, y: 10 * TILE_SIZE, tileX: 2 })
    const enemyShip = createDestroyer({
      id: 'unreachable-ship', owner: 'player1', x: 25 * TILE_SIZE, y: 10 * TILE_SIZE, tileX: 25
    })
    const state = { buildings: [], occupancyMap: [] }

    updateNavalAIUnit(unit, [unit, enemyShip], state, mapGrid, 1000, 'player2')
    expect(unit.path).toHaveLength(0)
    expect(unit.lastNavalAttackPathTime).toBe(1000)

    updateNavalAIUnit(unit, [unit, enemyShip], state, mapGrid, 1016, 'player2')
    expect(unit.lastNavalAttackPathTime).toBe(1000)

    updateNavalAIUnit(unit, [unit, enemyShip], state, mapGrid, 1000 + AI_DECISION_INTERVAL, 'player2')
    expect(unit.lastNavalAttackPathTime).toBe(1000 + AI_DECISION_INTERVAL)
  })
})
