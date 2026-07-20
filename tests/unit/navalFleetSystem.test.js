import { beforeEach, describe, expect, it } from 'vitest'
import '../setup.js'
import {
  SUBMARINE_SURFACE_DURATION,
  TILE_SIZE,
  UNIT_PROPERTIES,
  WATER_MINE_DAMAGE_RADIUS,
  WATER_MINE_TRIGGER_RADIUS
} from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import {
  requestCarrierLanding,
  requestTransportLoad,
  setBattleshipTarget,
  updateNavalFleet
} from '../../src/game/navalFleetSystem.js'
import {
  clearWaterMineSafely,
  deployWaterMine,
  getWaterMineAtTile,
  rebuildWaterMineLookup,
  updateWaterMines
} from '../../src/game/waterMineSystem.js'
import { getNavalRenderLengthTiles } from '../../src/utils/navalUtils.js'

function createMap(width = 30, height = 20, type = 'water') {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type, building: null, seedCrystal: false }))
  )
}

function createShip(type, id, owner, x = 8, y = 8) {
  const properties = UNIT_PROPERTIES[type]
  return {
    id,
    type,
    owner,
    isNaval: true,
    x: x * TILE_SIZE,
    y: y * TILE_SIZE,
    tileX: x,
    tileY: y,
    health: properties.health,
    maxHealth: properties.health,
    ammunition: 100,
    maxAmmunition: 100,
    direction: 0,
    path: [],
    movement: { velocity: { x: 0, y: 0 }, targetVelocity: { x: 0, y: 0 } }
  }
}

describe('six-ship naval fleet systems', () => {
  beforeEach(() => {
    gameState.waterMines = []
    gameState.depthCharges = []
    gameState.explosions = []
    gameState.buildings = []
    gameState.simulationTime = 0
    rebuildWaterMineLookup()
  })

  it('keeps transport and capital-ship balance relationships realistic', () => {
    expect(UNIT_PROPERTIES.hovercraft.transportCapacity).toBe(4)
    expect(UNIT_PROPERTIES.vehicleFerry.transportCapacity).toBe(10)
    expect(UNIT_PROPERTIES.hovercraft.speed).toBeGreaterThan(UNIT_PROPERTIES.vehicleFerry.speed)
    expect(UNIT_PROPERTIES.hovercraft.health).toBeLessThan(UNIT_PROPERTIES.vehicleFerry.health)
    expect(getNavalRenderLengthTiles('aircraftCarrier') / getNavalRenderLengthTiles('destroyer')).toBeCloseTo(2.4, 5)
  })

  it('routes a friendly land vehicle to a shoreline transport without using land occupancy as the ship tile', () => {
    const map = createMap(20, 20, 'land')
    for (let y = 0; y < map.length; y++) {
      for (let x = 10; x < map[y].length; x++) map[y][x].type = 'water'
    }
    const hovercraft = {
      ...createShip('hovercraft', 'hover', 'player1', 12, 8),
      transportCapacity: 4,
      embarkedUnitIds: []
    }
    const tank = { id: 'tank', type: 'tank_v1', owner: 'player1', x: 8 * TILE_SIZE, y: 8 * TILE_SIZE, health: 100 }

    expect(requestTransportLoad(hovercraft, tank, map)).toBe(true)
    expect(hovercraft.pendingLoadUnitId).toBe(tank.id)
    expect(map[hovercraft.moveTarget.y][hovercraft.moveTarget.x].type).toBe('water')
  })

  it('enforces four weighted carrier deck slots and services fuel/ammo without repairing HP', () => {
    const carrier = {
      ...createShip('aircraftCarrier', 'carrier', 'player1'),
      deckSlotCapacity: 4,
      carrierAircraftIds: [],
      carrierFuel: 500,
      carrierAmmo: 20
    }
    const f35a = { id: 'f35-a', type: 'f35', owner: 'player1', x: 0, y: 0, health: 30 }
    const f35b = { id: 'f35-b', type: 'f35', owner: 'player1', x: 0, y: 0, health: 30 }
    const f22 = { id: 'f22', type: 'f22Raptor', owner: 'player1', x: 0, y: 0, health: 20 }
    const units = [carrier, f35a, f35b, f22]

    expect(requestCarrierLanding(f35a, carrier, units, 100)).toBe(true)
    expect(requestCarrierLanding(f35b, carrier, units, 100)).toBe(true)
    expect(requestCarrierLanding(f22, carrier, units, 100)).toBe(false)

    f35a.carrierId = carrier.id
    f35a.carrierDeckSlotIndex = 0
    f35a.carrierOperation = { state: 'parked', carrierId: carrier.id }
    f35a.gas = 0
    f35a.maxGas = 100
    f35a.rocketAmmo = 0
    f35a.maxRocketAmmo = 8
    carrier.carrierAircraftIds = [f35a.id]
    const damagedHealth = f35a.health
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 200, 1000)
    expect(f35a.gas).toBeGreaterThan(0)
    expect(f35a.rocketAmmo).toBeGreaterThan(0)
    expect(f35a.health).toBe(damagedHealth)
  })

  it('lets fore and aft battleship batteries retain and fire at separate targets', () => {
    const battleship = {
      ...createShip('battleship', 'battle', 'player1'),
      selectedBattery: 'fore',
      batteries: { fore: { lastShotTime: 0 }, aft: { lastShotTime: 0 } }
    }
    const foreTarget = createShip('destroyer', 'fore-target', 'player2', 12, 8)
    const aftTarget = createShip('destroyer', 'aft-target', 'player2', 4, 8)
    expect(setBattleshipTarget(battleship, foreTarget)).toBe(true)
    battleship.selectedBattery = 'aft'
    expect(setBattleshipTarget(battleship, aftTarget)).toBe(true)

    const bullets = []
    updateNavalFleet([battleship, foreTarget, aftTarget], bullets, createMap(), { occupancyMap: [] }, 4000, 16)

    expect(battleship.batteries.fore.targetId).toBe(foreTarget.id)
    expect(battleship.batteries.aft.targetId).toBe(aftTarget.id)
    expect(bullets.filter(bullet => bullet.id.includes('-fore-'))).toHaveLength(2)
    expect(bullets.filter(bullet => bullet.id.includes('-aft-'))).toHaveLength(2)
  })

  it('surfaces gradually before launching a ship-only torpedo', () => {
    const submarine = {
      ...createShip('submarine', 'sub', 'player1'),
      depthState: 'submerged',
      depthTransitionProgress: 0,
      detectedByOwners: {},
      lastTorpedoTime: 0
    }
    const target = createShip('destroyer', 'target', 'player2', 12, 8)
    submarine.target = target
    const units = [submarine, target]
    const bullets = []
    const map = createMap()

    updateNavalFleet(units, bullets, map, { occupancyMap: [] }, 1000, 16)
    expect(submarine.depthState).toBe('surfacing')
    expect(bullets).toHaveLength(0)

    updateNavalFleet(units, bullets, map, { occupancyMap: [] }, 1000 + SUBMARINE_SURFACE_DURATION, 16)
    expect(submarine.depthState).toBe('surfaced')
    expect(bullets).toHaveLength(1)
    expect(bullets[0]).toMatchObject({ projectileType: 'torpedo', navalOnly: true, strictTarget: true })
  })

  it('allows close Destroyers to damage submerged submarines only with delayed depth charges', () => {
    const submarine = {
      ...createShip('submarine', 'sub', 'player2', 9, 8),
      depthState: 'submerged',
      depthTransitionProgress: 0,
      detectedByOwners: {},
      lastTorpedoTime: 0
    }
    const destroyer = createShip('destroyer', 'destroyer', 'player1', 8, 8)
    const initialHealth = submarine.health
    const units = [submarine, destroyer]
    const map = createMap()

    updateNavalFleet(units, [], map, { occupancyMap: [] }, 4000, 16)
    expect(gameState.depthCharges).toHaveLength(1)
    expect(submarine.health).toBe(initialHealth)

    updateNavalFleet(units, [], map, { occupancyMap: [] }, 4900, 16)
    expect(gameState.depthCharges).toHaveLength(0)
    expect(submarine.health).toBe(initialHealth - 110)
  })
})

describe('water mine system', () => {
  beforeEach(() => {
    gameState.waterMines = []
    gameState.explosions = []
    rebuildWaterMineLookup()
  })

  it('uses larger naval trigger/blast radii, ignores land and submerged units, and supports safe clearing', () => {
    expect(WATER_MINE_DAMAGE_RADIUS).toBeGreaterThan(WATER_MINE_TRIGGER_RADIUS)
    const map = createMap()
    expect(deployWaterMine(5, 5, 'player1', createMap(10, 10, 'land'), 0)).toBeNull()
    const mine = deployWaterMine(5, 5, 'player1', map, 0)
    const surfaceShip = createShip('destroyer', 'surface', 'player2', 5, 5)
    const submerged = { ...createShip('submarine', 'submerged', 'player2', 5, 5), depthState: 'submerged' }
    const tank = { id: 'tank', owner: 'player2', type: 'tank_v1', x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, health: 100 }

    updateWaterMines(mine.armedAt, [surfaceShip, submerged, tank])
    expect(surfaceShip.health).toBeLessThan(surfaceShip.maxHealth)
    expect(submerged.health).toBe(submerged.maxHealth)
    expect(tank.health).toBe(100)

    const sweepMine = deployWaterMine(7, 7, 'player2', map, 0)
    expect(getWaterMineAtTile(7, 7)).toBe(sweepMine)
    expect(clearWaterMineSafely(sweepMine)).toBe(true)
    expect(getWaterMineAtTile(7, 7)).toBeNull()
  })
})
