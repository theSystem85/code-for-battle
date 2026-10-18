import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/rendering.js', () => ({
  getMapRenderer: vi.fn(() => null),
  getTextureManager: vi.fn(() => null)
}))

vi.mock('../../src/main.js', () => ({
  factories: [],
  mapGrid: [],
  units: [],
  getCurrentGame: vi.fn(() => null)
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn(),
  audioContext: null,
  getMasterVolume: vi.fn(() => 1)
}))

import { TILE_SIZE } from '../../src/config.js'
import { hasClearShot } from '../../src/logic.js'
import { ensureLineOfSight } from '../../src/game/unitCombat/combatHelpers.js'
import { hasFriendlyUnitOnTile } from '../../src/game/movementCore.js'
import {
  ownerUnitList,
  rebuildOwnerUnitIndex,
  resetOwnerUnitIndexForTests
} from '../../src/game/unitOwnerIndex.js'
import { gameState } from '../../src/gameState.js'

function openMap(size = 12) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ building: false, type: 'land' }))
  )
}

describe('owner unit index', () => {
  afterEach(() => {
    resetOwnerUnitIndexForTests()
  })

  it('[U00872] checks live center tiles after same-pass collision movement and never self-blocks', () => {
    const mover = { id: 'self', x: 15.9, y: 0, type: 'tank', owner: 'player1', health: 100 }
    const other = { id: 'other', x: 16, y: 0, type: 'tank', owner: 'player1', health: 100 }
    rebuildOwnerUnitIndex([mover, other])
    expect(hasFriendlyUnitOnTile(mover, 0, 0, [])).toBe(false)
    expect(hasFriendlyUnitOnTile(mover, 1, 0, [])).toBe(true)
    other.x = 48
    expect(hasFriendlyUnitOnTile(mover, 1, 0, [])).toBe(false)
    expect(hasFriendlyUnitOnTile(mover, 2, 0, [])).toBe(true)
    other.health = 0
    expect(hasFriendlyUnitOnTile(mover, 2, 0, [])).toBe(false)
  })

  it('[U00873] handles missing tile metadata from live centers and rejects non-finite line endpoints', () => {
    const shooter = { x: 0, y: 0, owner: 'player1' }
    const target = { tileX: 6, x: 6 * TILE_SIZE, y: 6 * TILE_SIZE, owner: 'player2' }
    expect(hasClearShot(shooter, target, [shooter, target], openMap())).toBe(true)
    expect(hasClearShot(shooter, { ...target, tileY: NaN }, [shooter, target], openMap())).toBe(false)
    expect(hasClearShot({ ...shooter, x: Infinity }, target, [], openMap())).toBe(false)
  })

  it('[U00874] excludes the actual mover when testing a hypothetical firing position', () => {
    const unit = { id: 'mover', x: 2 * TILE_SIZE, y: 0, owner: 'player1' }
    const proxy = { x: TILE_SIZE, y: 0, owner: unit.owner }
    const target = { tileX: 8, tileY: 0, x: 8 * TILE_SIZE, y: 0, owner: 'player2' }
    const map = openMap()
    expect(hasClearShot(proxy, target, [unit], map)).toBe(false)
    expect(hasClearShot(proxy, target, [unit], map, unit)).toBe(true)
    expect(proxy.x).toBe(TILE_SIZE)
    expect(hasClearShot(proxy, target, [unit, { x: 4 * TILE_SIZE, y: 0, owner: unit.owner }], map, unit)).toBe(false)
  })

  it('[U00875] stays inactive until a movement or combat pass rebuilds it', () => {
    expect(ownerUnitList('player1')).toBeNull()
  })

  it('[U00876] groups live unit references by owner and reuses the lists', () => {
    const friendly = { id: 'a', owner: 'player1', x: 0, y: 0 }
    const enemy = { id: 'b', owner: 'player2', x: 32, y: 0 }
    rebuildOwnerUnitIndex([friendly, enemy, null, { x: 0, y: 0 }])

    const first = ownerUnitList('player1')
    expect(first).toEqual([friendly])
    expect(ownerUnitList('player2')).toEqual([enemy])
    expect(ownerUnitList('missing')).toEqual([])

    friendly.x = 64
    expect(first[0].x).toBe(64)

    rebuildOwnerUnitIndex([enemy])
    expect(ownerUnitList('player1')).toEqual([])
    expect(ownerUnitList('player2')).toEqual([enemy])
  })

  it('[U00877] blocks a shot on the indexed friendlies even when the passed array omits them', () => {
    const shooter = { x: 0, y: 0, owner: 'player1' }
    const target = { tileX: 6, x: 6 * TILE_SIZE, y: 6 * TILE_SIZE, owner: 'player2' }
    const friendly = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE, owner: 'player1' }
    const mapGrid = openMap()

    expect(hasClearShot(shooter, target, [shooter, target], mapGrid)).toBe(true)

    rebuildOwnerUnitIndex([shooter, friendly, target])
    expect(hasClearShot(shooter, target, [shooter, target], mapGrid)).toBe(false)

    resetOwnerUnitIndexForTests()
    expect(hasClearShot(shooter, target, [shooter, friendly, target], mapGrid)).toBe(false)
    expect(hasClearShot(shooter, target, [shooter, target], mapGrid)).toBe(true)
  })

  it('[U00878] treats player and player1 as the same side for tile occupancy', () => {
    const unit = { id: 'mover', owner: 'player', x: 0, y: 0, health: 100, type: 'tank' }
    const alias = {
      id: 'alias',
      owner: 'player1',
      x: 10 * TILE_SIZE,
      y: 10 * TILE_SIZE,
      health: 100,
      type: 'tank'
    }
    const enemy = {
      id: 'enemy',
      owner: 'player2',
      x: 4 * TILE_SIZE,
      y: 4 * TILE_SIZE,
      health: 100,
      type: 'tank'
    }

    rebuildOwnerUnitIndex([unit, alias, enemy])
    expect(hasFriendlyUnitOnTile(unit, 10, 10, [])).toBe(true)
    expect(hasFriendlyUnitOnTile(unit, 4, 4, [])).toBe(false)

    resetOwnerUnitIndexForTests()
    expect(hasFriendlyUnitOnTile(unit, 10, 10, [unit, alias, enemy])).toBe(true)
    expect(hasFriendlyUnitOnTile(unit, 4, 4, [unit, alias, enemy])).toBe(false)
  })

  it('[U00879] searches for a sidestep a few times a second while the shot stays blocked', () => {
    const previousTime = gameState.simulationTime
    const previousOccupancy = gameState.occupancyMap
    gameState.occupancyMap = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => 0))
    const shooter = { x: 0, y: 0, owner: 'player1', path: [] }
    const target = { tileX: 6, x: 6 * TILE_SIZE, y: 0, owner: 'player2' }
    const friendly = { x: 3 * TILE_SIZE, y: 0, owner: 'player1' }
    const units = [shooter, friendly, target]
    const mapGrid = openMap()

    gameState.simulationTime = 1000
    expect(ensureLineOfSight(shooter, target, units, mapGrid)).toBe(false)
    expect(shooter.clearShotSearchAt).toBe(1300)

    ensureLineOfSight(shooter, target, units, mapGrid)
    expect(shooter.clearShotSearchAt).toBe(1300)

    gameState.simulationTime = 1300
    ensureLineOfSight(shooter, target, units, mapGrid)
    expect(shooter.clearShotSearchAt).toBe(1600)

    gameState.simulationTime = previousTime
    gameState.occupancyMap = previousOccupancy
  })
})
