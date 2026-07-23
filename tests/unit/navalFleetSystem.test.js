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
  requestCarrierLaunch,
  requestTransportLoad,
  requestTransportUnload,
  tryHandleFleetCommand,
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
import { addShipWake, getNavalHullDimensions, getNavalRenderLengthTiles } from '../../src/utils/navalUtils.js'

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
    expect(['land', 'street']).toContain(map[tank.moveTarget.y][tank.moveTarget.x].type)
  })

  it('supports ground-selected boarding commands and completes loading at the coastal rendezvous', () => {
    const map = createMap(20, 20, 'land')
    for (let y = 0; y < map.length; y++) {
      for (let x = 10; x < map[y].length; x++) map[y][x].type = 'water'
    }
    const ferry = {
      ...createShip('vehicleFerry', 'ferry', 'player1', 10, 8),
      transportCapacity: 10,
      embarkedUnitIds: [],
      pendingLoadUnitIds: []
    }
    const tank = { id: 'tank', type: 'tank_v1', owner: 'player1', x: 8 * TILE_SIZE, y: 8 * TILE_SIZE, health: 100, path: [] }
    const ambulance = { id: 'ambulance', type: 'ambulance', owner: 'player1', x: 8 * TILE_SIZE, y: 9 * TILE_SIZE, health: 100, path: [] }
    const units = [ferry, tank, ambulance]

    expect(tryHandleFleetCommand([tank, ambulance], ferry.x + TILE_SIZE / 2, ferry.y + TILE_SIZE / 2, units, map)).toBe(true)
    expect(ferry.pendingLoadUnitIds).toEqual(['tank', 'ambulance'])
    expect(map[ferry.moveTarget.y][ferry.moveTarget.x].type).toBe('water')

    const rendezvous = ferry.pendingLoadRendezvous
    const tankSlot = rendezvous.cargoSlots[tank.id]
    const ambulanceSlot = rendezvous.cargoSlots[ambulance.id]
    ferry.x = rendezvous.desiredCenterX - TILE_SIZE / 2
    ferry.y = rendezvous.desiredCenterY - TILE_SIZE / 2
    ferry.tileX = Math.floor((ferry.x + TILE_SIZE / 2) / TILE_SIZE)
    ferry.tileY = Math.floor((ferry.y + TILE_SIZE / 2) / TILE_SIZE)
    ferry.moveTarget = null

    tank.x = tankSlot.x * TILE_SIZE
    tank.y = tankSlot.y * TILE_SIZE
    ambulance.x = ambulanceSlot.x * TILE_SIZE
    ambulance.y = ambulanceSlot.y * TILE_SIZE
    updateNavalFleet(units, [], map, { occupancyMap: [] }, 1000, 16)
    expect(ferry.transportOperation).toMatchObject({ kind: 'load', phase: 'aligning' })
    expect(ferry.embarkedUnitIds).toEqual([])

    let animationNow = 1016
    while (!units.some(unit => unit.transportTransfer?.phase === 'moving') && animationNow < 3000) {
      updateNavalFleet(units, [], map, { occupancyMap: [] }, animationNow, 16)
      animationNow += 16
    }
    const transferringCargo = units.find(unit => unit.transportTransfer)
    expect(transferringCargo?.transportTransfer).toMatchObject({ kind: 'load', transportId: ferry.id })
    expect(transferringCargo?.embarkedOnId).toBeUndefined()
    const cargoCenterX = transferringCargo.x + TILE_SIZE / 2
    const cargoCenterY = transferringCargo.y + TILE_SIZE / 2
    const expectedCargoDirection = Math.atan2(rendezvous.contactY - cargoCenterY, rendezvous.contactX - cargoCenterX)
    expect(transferringCargo.direction).toBeCloseTo(expectedCargoDirection, 1)
    const sternOffset = getNavalHullDimensions(ferry.type).length / 2
    expect(ferry.x + TILE_SIZE / 2 - Math.cos(ferry.direction) * sternOffset).toBeCloseTo(rendezvous.contactX, 1)
    expect(ferry.y + TILE_SIZE / 2 - Math.sin(ferry.direction) * sternOffset).toBeCloseTo(rendezvous.contactY, 1)
    while (ferry.transportOperation && animationNow < 6000) {
      updateNavalFleet(units, [], map, { occupancyMap: [] }, animationNow, 16)
      animationNow += 16
    }

    expect(ferry.embarkedUnitIds).toEqual(['tank', 'ambulance'])
    expect(ferry.embarkedUnitTypes).toEqual(['tank_v1', 'ambulance'])
    expect(ferry.pendingLoadUnitIds).toEqual([])
  })

  it('supports the inverse transport-selected boarding command even when the hull overlaps the cargo hit area', () => {
    const map = createMap(20, 20, 'land')
    for (let y = 0; y < map.length; y++) {
      for (let x = 10; x < map[y].length; x++) map[y][x].type = 'water'
    }
    const hovercraft = {
      ...createShip('hovercraft', 'hover', 'player1', 10, 8),
      transportCapacity: 4,
      embarkedUnitIds: [],
      pendingLoadUnitIds: []
    }
    const tank = { id: 'tank', type: 'tank_v1', owner: 'player1', x: 9 * TILE_SIZE, y: 8 * TILE_SIZE, health: 100, path: [] }

    expect(tryHandleFleetCommand(
      [hovercraft],
      tank.x + TILE_SIZE / 2,
      tank.y + TILE_SIZE / 2,
      [hovercraft, tank],
      map
    )).toBe(true)
    expect(hovercraft.pendingLoadUnitIds).toEqual([tank.id])
  })

  it('disembarks at the shoreline and sends cargo onward to the clicked land destination', () => {
    const map = createMap(20, 20, 'land')
    for (let y = 0; y < map.length; y++) {
      for (let x = 10; x < map[y].length; x++) map[y][x].type = 'water'
    }
    const ferry = {
      ...createShip('vehicleFerry', 'ferry', 'player1', 10, 8),
      transportCapacity: 10,
      embarkedUnitIds: ['tank'],
      embarkedUnitTypes: ['tank_v1'],
      guardMode: true,
      guardTarget: { id: 'old-guard' }
    }
    const tank = {
      id: 'tank',
      type: 'tank_v1',
      owner: 'player1',
      x: ferry.x,
      y: ferry.y,
      health: 100,
      embarkedOnId: ferry.id,
      guardMode: true,
      guardTarget: { id: 'old-guard' },
      path: []
    }
    const occupancyMap = Array.from({ length: 20 }, () => Array(20).fill(0))

    expect(requestTransportUnload(ferry, 4, 8, map)).toBe(true)
    expect(ferry.moveTarget).toEqual({ x: 10, y: 8 })
    expect(ferry.guardMode).toBe(false)

    updateNavalFleet([ferry, tank], [], map, { occupancyMap }, 1000, 16)
    expect(ferry.transportOperation).toMatchObject({ kind: 'unload', phase: 'aligning' })
    expect(ferry.moveTarget).toBeNull()
    updateNavalFleet([ferry, tank], [], map, { occupancyMap }, 1010, 16)
    updateNavalFleet([ferry, tank], [], map, { occupancyMap }, 1020, 16)
    expect(tank.transportTransfer).toMatchObject({ kind: 'unload', transportId: ferry.id })
    expect(tank.embarkedOnId).toBeNull()
    updateNavalFleet([ferry, tank], [], map, { occupancyMap }, 2020, 16)

    expect(ferry.embarkedUnitIds).toEqual([])
    expect(ferry.embarkedUnitTypes).toEqual([])
    expect(tank.embarkedOnId).toBeNull()
    expect(tank.tileX).toBe(9)
    expect(tank.moveTarget).toEqual({ x: 4, y: 8 })
    expect(tank.guardMode).toBe(false)
    expect(occupancyMap[tank.tileY][tank.tileX]).toBe(1)
    expect(requestTransportUnload({ ...ferry, embarkedUnitIds: ['tank'] }, 12, 8, map)).toBe(false)

    const overlappingCoastFerry = {
      ...ferry,
      embarkedUnitIds: ['tank'],
      pendingUnloadTile: null
    }
    expect(tryHandleFleetCommand(
      [overlappingCoastFerry],
      9 * TILE_SIZE + TILE_SIZE / 2,
      8 * TILE_SIZE + TILE_SIZE / 2,
      [overlappingCoastFerry],
      map
    )).toBe(true)
    expect(overlappingCoastFerry.pendingUnloadTile).toMatchObject({ x: 9, y: 8 })
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
    expect(f35a.y + TILE_SIZE / 2).toBeGreaterThan(carrier.y + TILE_SIZE / 2)
    expect(f35a.gas).toBeGreaterThan(0)
    expect(f35a.rocketAmmo).toBeGreaterThan(0)
    expect(f35a.health).toBe(damagedHealth)
  })

  it('accepts Apache VTOL recovery as a two-slot carrier aircraft', () => {
    const carrier = {
      ...createShip('aircraftCarrier', 'carrier', 'player1'),
      deckSlotCapacity: 4,
      carrierAircraftIds: [],
      carrierFuel: 500,
      carrierAmmo: 20
    }
    const apacheA = { id: 'apache-a', type: 'apache', owner: 'player1', x: 0, y: 0, health: 100, altitude: TILE_SIZE * 4 }
    const apacheB = { id: 'apache-b', type: 'apache', owner: 'player1', x: 0, y: 0, health: 100, altitude: TILE_SIZE * 4 }
    const apacheC = { id: 'apache-c', type: 'apache', owner: 'player1', x: 0, y: 0, health: 100, altitude: TILE_SIZE * 4 }
    const units = [carrier, apacheA, apacheB, apacheC]

    expect(requestCarrierLanding(apacheA, carrier, units, 100)).toBe(true)
    expect(requestCarrierLanding(apacheB, carrier, units, 100)).toBe(true)
    expect(requestCarrierLanding(apacheC, carrier, units, 100)).toBe(false)
  })

  it('eases fixed-wing taxi and launch through continuous carrier-relative stages', () => {
    const carrier = {
      ...createShip('aircraftCarrier', 'carrier', 'player1'),
      deckSlotCapacity: 4,
      carrierAircraftIds: ['f22']
    }
    const f22 = {
      id: 'f22', type: 'f22Raptor', owner: 'player1', health: 100,
      x: carrier.x, y: carrier.y, altitude: 0, direction: 0,
      carrierId: carrier.id, carrierDeckSlotIndex: 0,
      carrierOperation: { state: 'parked', carrierId: carrier.id },
      flightState: 'grounded'
    }
    const units = [carrier, f22]

    expect(requestCarrierLaunch(f22, { x: 20, y: 8 }, 100)).toBe(true)
    expect(f22.carrierOperation.state).toBe('launch_taxi')
    const parkedX = f22.x
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 750, 16)
    expect(f22.x).not.toBe(parkedX)
    expect(f22.altitude).toBe(0)
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 1400, 16)
    expect(f22.carrierOperation.state).toBe('launch')
    const runwayStartX = f22.x
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 2250, 16)
    expect(f22.x).toBeGreaterThan(runwayStartX)
    expect(f22.altitude).toBeGreaterThan(0)
    expect(f22.altitude).toBeLessThan(TILE_SIZE * 4.5)
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 3200, 16)
    expect(f22.carrierOperation).toBeNull()
    expect(f22.carrierId).toBeNull()
    expect(f22.moveTarget).toEqual({ x: 20, y: 8 })
  })

  it('places bow wakes ahead of the hull and suppresses all submerged-submarine wakes', () => {
    const destroyer = createShip('destroyer', 'destroyer', 'player1')
    destroyer.movement.currentSpeed = 1
    destroyer.movement.isMoving = true
    const wakeState = { shipWakes: [] }

    addShipWake(destroyer, wakeState, 1000)
    const bow = wakeState.shipWakes.find(wake => wake.kind === 'bow')
    const hullHalfLength = TILE_SIZE * (getNavalRenderLengthTiles('destroyer') / 2) * 0.895
    expect(bow.x).toBeCloseTo(destroyer.x + TILE_SIZE / 2 + hullHalfLength + 6)

    const submarine = {
      ...createShip('submarine', 'sub', 'player1'),
      depthState: 'submerged'
    }
    submarine.movement.currentSpeed = 1
    submarine.movement.isMoving = true
    wakeState.shipWakes.push({ sourceUnitId: submarine.id, kind: 'bow' })
    addShipWake(submarine, wakeState, 1100)
    expect(wakeState.shipWakes.some(wake => wake.sourceUnitId === submarine.id)).toBe(false)
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
