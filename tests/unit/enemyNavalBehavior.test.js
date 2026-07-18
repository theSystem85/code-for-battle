import { describe, expect, it } from 'vitest'
import '../setup.js'
import { TILE_SIZE } from '../../src/config.js'
import { updateNavalAIUnit } from '../../src/ai/enemyUnitBehavior.js'

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
})
