import { beforeEach, describe, expect, it } from 'vitest'
import '../setup.js'
import { buildOccupancyMap, findPath } from '../../src/units.js'
import { createNavalClearanceCheck } from '../../src/game/navalClearance.js'
import { getCachedPath } from '../../src/game/pathfinding.js'
import { pathCache } from '../../src/game/pathCache.js'
import { getNavalHullDimensions, getNavalPathOptions } from '../../src/utils/navalUtils.js'
import { TILE_SIZE } from '../../src/config.js'
import { createCommandPathOptions } from '../../src/input/unitCommands/commandPathOptions.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'

function ocean() {
  return Array.from({ length: 60 }, () => Array.from({ length: 60 }, () => ({ type: 'water' })))
}

function coast() {
  const grid = ocean()
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      if (x < 22 || (x <= 28 && y >= 28)) grid[y][x].type = 'land'
    }
  }
  return grid
}

function route(grid, type, start, end, options = {}) {
  return findPath({ ...start, type }, end, grid, buildOccupancyMap([], grid), undefined,
    { ...getNavalPathOptions({ type, owner: 'player1' }), allowNavalDestinationAdjustment: true, ...options })
}

describe('naval hull-aware routes', () => {
  beforeEach(() => pathCache.clear())

  it.each(['destroyer', 'battleship', 'aircraftCarrier'])('[U07079] keeps a remote open-water order straight despite its own center occupancy (%s)', type => {
    const grid = ocean()
    const ship = { type, isNaval: true, health: 100, x: 20.6 * TILE_SIZE, y: 20.6 * TILE_SIZE }
    const start = { x: 21, y: 21, type }
    const end = { x: 40, y: 37 }
    const path = findPath(start, end, grid, buildOccupancyMap([ship], grid), undefined, {
      ...createCommandPathOptions([ship], grid), ...getNavalPathOptions(ship)
    })
    expect(path).toEqual([{ x: 21, y: 21 }, end])
  })

  it.each(['destroyer', 'battleship', 'aircraftCarrier'])('[U07080] keeps every smoothed segment far enough from the headland to turn (%s)', type => {
    const grid = coast()
    const path = route(grid, type, { x: 29, y: 22 }, { x: 35, y: 36 })
    expect(path.at(-1)).toEqual({ x: 35, y: 36 })
    expect(path.length).toBeLessThanOrEqual(4)
    const hullRadius = getNavalHullDimensions(type).length / (2 * TILE_SIZE)
    for (let i = 1; i < path.length; i++) {
      for (let step = 0; step <= 100; step++) {
        const x = path[i - 1].x + 0.5 + (path[i].x - path[i - 1].x) * step / 100
        const y = path[i - 1].y + 0.5 + (path[i].y - path[i - 1].y) * step / 100
        // Closest point on the rectangular headland x <= 29, y >= 28.
        const distance = Math.hypot(Math.max(0, x - 29), Math.max(0, 28 - y))
        expect(distance).toBeGreaterThan(hullRadius)
      }
    }
  })

  it('[U07081] adjusts a coast-adjacent destination offshore in proportion to hull length', () => {
    const grid = coast()
    const destinations = ['destroyer', 'battleship', 'aircraftCarrier'].map(type => {
      const path = route(grid, type, { x: 40, y: 36 }, { x: 29, y: 36 }, { strictDestination: true })
      expect(path.length).toBeGreaterThan(1)
      expect(createNavalClearanceCheck(grid, type)(path.at(-1).x, path.at(-1).y)).toBe(true)
      return path.at(-1).x
    })
    expect(destinations[0]).toBeLessThan(destinations[1])
    expect(destinations[1]).toBeLessThan(destinations[2])
  })

  it('[U07082] lets a ship already parallel to the shore escape into safe water', () => {
    const grid = coast()
    const path = route(grid, 'aircraftCarrier', { x: 30, y: 36 }, { x: 40, y: 36 })
    expect(path).toEqual([{ x: 30, y: 36 }, { x: 40, y: 36 }])
  })

  it('[U07088] keeps strict candidate searches exact unless the move command allows offshore adjustment', () => {
    const grid = coast()
    expect(route(grid, 'aircraftCarrier', { x: 40, y: 36 }, { x: 29, y: 36 }, {
      strictDestination: true, allowNavalDestinationAdjustment: false
    })).toEqual([])
    const start = { x: 40, y: 36, type: 'aircraftCarrier' }
    const end = { x: 29, y: 36 }
    const options = getNavalPathOptions(start)
    expect(getCachedPath(start, end, grid, null, options).length).toBeGreaterThan(1)
    expect(getCachedPath(start, end, grid, null, { ...options, strictDestination: true })).toEqual([])
  })

  it('[U07087] reserves full arrival clearance even for a short order from an unsafe shore position', () => {
    const grid = coast()
    const path = route(grid, 'aircraftCarrier', { x: 30, y: 36 }, { x: 31, y: 36 }, { strictDestination: true })
    expect(path.at(-1)).toEqual({ x: 34, y: 36 })
    expect(path.length).toBe(2)
  })

  it('[U07083] does not reuse a small ship route for a carrier', () => {
    const grid = coast()
    const end = { x: 35, y: 36 }
    const start = { x: 29, y: 22 }
    const small = getCachedPath({ ...start, type: 'destroyer' }, end, grid, null, getNavalPathOptions({ type: 'destroyer' }))
    const large = getCachedPath({ ...start, type: 'aircraftCarrier' }, end, grid, null, getNavalPathOptions({ type: 'aircraftCarrier' }))
    expect(large).not.toEqual(small)
    expect(large).toEqual(route(grid, 'aircraftCarrier', start, end))
  })

  it('[U07084] paints water yellow, ships and ground units orange, and fixed obstacles red', () => {
    const renderer = new MapRenderer({})
    const grid = [[{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'rock' }]]
    const ship = { isNaval: true, health: 100, x: 0.6 * TILE_SIZE, y: 0 }
    const tank = { health: 100, x: 2 * TILE_SIZE, y: 0 }
    const fills = []
    const ctx = { fillRect(x) { fills.push([x / TILE_SIZE, this.fillStyle]) } }
    renderer.renderOccupancyMap(ctx, buildOccupancyMap([ship, tank], grid), 0, 0, 4, 1, { x: 0, y: 0 }, {
      occupancyVisible: true, mapGrid: grid, units: [ship, tank]
    })
    expect(fills).toEqual([
      [0, 'rgba(255, 255, 0, 0.35)'], [1, 'rgba(255, 140, 0, 0.55)'],
      [2, 'rgba(255, 140, 0, 0.55)'], [3, 'rgba(255, 0, 0, 0.3)']
    ])
    ship.x = 2 * TILE_SIZE
    fills.length = 0
    renderer.renderOccupancyMap(ctx, buildOccupancyMap([ship, tank], grid), 0, 0, 4, 1, { x: 0, y: 0 }, {
      occupancyVisible: true, mapGrid: grid, units: [ship, tank]
    })
    expect(fills[1]).toEqual([1, 'rgba(255, 255, 0, 0.35)'])
  })
})
