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
  commandCarrierStrike,
  requestCarrierLanding,
  requestCarrierLaunch,
  requestTransportLoad,
  requestTransportUnload,
  SUBMARINE_TORPEDO_COOLDOWN,
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
import {
  BATTLESHIP_TURRET_NAMES,
  clearBattleshipFireControl,
  createBattleshipTurrets,
  ensureBattleshipTurrets,
  getBattleshipTurretBlockedArc,
  getBattleshipTurretWorldPoint,
  isBattleshipTurretAngleBlocked,
  selectBattleshipTurret
} from '../../src/game/battleshipTurrets.js'
import { canUnitTargetEntity, getEffectiveFireRange } from '../../src/game/unitCombat/combatHelpers.js'

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
    gameState.factories = []
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
    expect(ferry.transportOperation).toMatchObject({ kind: 'load', phase: 'turning_offshore' })
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
    expect(map[ferry.moveTarget.y][ferry.moveTarget.x].type).toBe('water')
    expect(ferry.guardMode).toBe(false)

    ferry.x = ferry.moveTarget.x * TILE_SIZE
    ferry.y = ferry.moveTarget.y * TILE_SIZE
    ferry.tileX = ferry.moveTarget.x
    ferry.tileY = ferry.moveTarget.y

    updateNavalFleet([ferry, tank], [], map, { occupancyMap }, 1000, 16)
    expect(ferry.transportOperation).toMatchObject({ kind: 'unload', phase: 'turning_offshore' })
    expect(ferry.moveTarget).toBeNull()
    let unloadNow = 1010
    while (!tank.transportTransfer && unloadNow < 5000) {
      updateNavalFleet([ferry, tank], [], map, { occupancyMap }, unloadNow, 16)
      unloadNow += 16
    }
    expect(tank.transportTransfer).toMatchObject({ kind: 'unload', transportId: ferry.id })
    expect(tank.embarkedOnId).toBeNull()
    updateNavalFleet([ferry, tank], [], map, { occupancyMap }, unloadNow + 1000, 16)

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
    let now = 766
    while (f22.carrierOperation.state === 'launch_taxi' && now < 4000) {
      updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, now, 16)
      now += 16
    }
    expect(f22.carrierOperation.state).toBe('launch')
    const runwayStartX = f22.x
    const launchStartedAt = f22.carrierOperation.startedAt
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, launchStartedAt + 850, 16)
    expect(f22.x).toBeGreaterThan(runwayStartX)
    expect(f22.altitude).toBeGreaterThan(0)
    expect(f22.altitude).toBeLessThan(TILE_SIZE * 4.5)
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, launchStartedAt + 1800, 16)
    expect(f22.carrierOperation).toBeNull()
    expect(f22.carrierId).toBeNull()
    expect(f22.moveTarget).toEqual({ x: 20, y: 8 })
  })

  it('holds F35 altitude until directly above its reserved carrier parking position', () => {
    const carrier = {
      ...createShip('aircraftCarrier', 'carrier', 'player1'),
      deckSlotCapacity: 4,
      carrierAircraftIds: []
    }
    const f35 = {
      id: 'f35', type: 'f35', owner: 'player1', health: 100,
      x: carrier.x + TILE_SIZE * 5, y: carrier.y + TILE_SIZE * 2,
      altitude: TILE_SIZE * 4, maxAltitude: TILE_SIZE * 4,
      direction: Math.PI, movement: { velocity: { x: 0, y: 0 } }
    }
    const units = [carrier, f35]

    expect(requestCarrierLanding(f35, carrier, units, 100)).toBe(true)
    let now = 116
    while (f35.carrierOperation.state === 'carrier_rendezvous' && now < 6000) {
      const altitudeBefore = f35.altitude
      updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, now, 16)
      if (f35.carrierOperation.state === 'carrier_rendezvous') expect(f35.altitude).toBe(altitudeBefore)
      now += 16
    }

    expect(f35.carrierOperation.state).toBe('vertical_landing')
    const touchdownX = f35.x
    const touchdownY = f35.y
    const descentStartedAt = f35.carrierOperation.startedAt
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, descentStartedAt + 900, 16)
    expect(f35.x).toBeCloseTo(touchdownX, 5)
    expect(f35.y).toBeCloseTo(touchdownY, 5)
    expect(f35.altitude).toBeGreaterThan(0)
    expect(f35.altitude).toBeLessThan(TILE_SIZE * 4)
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, descentStartedAt + 1900, 16)
    expect(f35.carrierOperation.state).toBe('parked')
    expect(f35.x).toBeCloseTo(touchdownX, 5)
    expect(f35.y).toBeCloseTo(touchdownY, 5)
  })

  it('lets an F22 enter the carrier approach only inside eight tiles while the carrier is stopped', () => {
    const carrier = {
      ...createShip('aircraftCarrier', 'carrier', 'player1'),
      deckSlotCapacity: 4,
      carrierAircraftIds: []
    }
    const f22 = {
      id: 'f22', type: 'f22Raptor', owner: 'player1', health: 100,
      x: carrier.x - TILE_SIZE * 12, y: carrier.y,
      altitude: TILE_SIZE * 4, direction: 0,
      movement: { velocity: { x: 0, y: 0 } }
    }
    const units = [carrier, f22]
    expect(requestCarrierLanding(f22, carrier, units, 100)).toBe(true)

    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 116, 16)
    expect(f22.carrierOperation.state).toBe('carrier_rendezvous')
    expect(f22.altitude).toBe(TILE_SIZE * 4)

    f22.x = carrier.x - TILE_SIZE * 7
    carrier.movement.velocity.x = 0.2
    carrier.movement.currentSpeed = 0.2
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 132, 16)
    expect(f22.carrierOperation.state).toBe('carrier_rendezvous')

    carrier.movement.velocity.x = 0
    carrier.movement.currentSpeed = 0
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 148, 16)
    expect(f22.carrierOperation.state).toBe('approach')
    expect(f22.altitude).toBe(TILE_SIZE * 4)
  })

  it('keeps a carrier stopped while its aircraft cycle through strike, recovery, and relaunch', () => {
    const carrier = {
      ...createShip('aircraftCarrier', 'carrier', 'player1'),
      deckSlotCapacity: 4,
      carrierAircraftIds: ['f22', 'f35'],
      carrierFuel: 500,
      carrierAmmo: 50,
      moveTarget: { x: 20, y: 8 },
      path: [{ x: 20, y: 8 }],
      navalAngularVelocity: 0.02,
      isRotating: true
    }
    const f22 = {
      id: 'f22', type: 'f22Raptor', owner: 'player1', health: 100,
      x: carrier.x, y: carrier.y, altitude: 0,
      carrierId: carrier.id, homeCarrierId: carrier.id, carrierDeckSlotIndex: 0,
      carrierOperation: { state: 'parked', carrierId: carrier.id },
      flightState: 'grounded', rocketAmmo: 4, maxRocketAmmo: 4
    }
    const f35 = {
      id: 'f35', type: 'f35', owner: 'player1', health: 100,
      x: carrier.x, y: carrier.y, altitude: 0,
      carrierId: carrier.id, homeCarrierId: carrier.id, carrierDeckSlotIndex: 1,
      carrierOperation: { state: 'parked', carrierId: carrier.id },
      flightState: 'grounded', rocketAmmo: 4, maxRocketAmmo: 4
    }
    const targetA = createShip('destroyer', 'target-a', 'player2', 18, 8)
    const targetB = createShip('destroyer', 'target-b', 'player2', 20, 8)
    const units = [carrier, f22, f35, targetA, targetB]

    expect(commandCarrierStrike(carrier, targetA, units, false, 100)).toBe(true)
    expect(commandCarrierStrike(carrier, targetB, units, true, 100)).toBe(true)
    expect(carrier.carrierStrikeTargetIds).toEqual(['target-a', 'target-b'])
    expect(carrier.moveTarget).toBeNull()
    expect(carrier.path).toEqual([])
    expect(carrier.navalAngularVelocity).toBe(0)
    expect(f22.carrierOperation.state).toBe('launch_taxi')
    expect(f35.carrierOperation.state).toBe('launch')

    f35.carrierOperation = null
    f35.carrierId = null
    f35.rocketAmmo = 0
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 200, 16)
    expect(f35.carrierOperation).toMatchObject({ state: 'carrier_rendezvous', carrierId: carrier.id })
    expect(f35.homeCarrierId).toBe(carrier.id)

    f35.carrierOperation = { state: 'parked', carrierId: carrier.id }
    f35.carrierId = carrier.id
    f35.rocketAmmo = f35.maxRocketAmmo
    updateNavalFleet(units, [], createMap(), { occupancyMap: [] }, 300, 16)
    expect(f35.carrierOperation.state).toBe('launch')
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

  it('lets all four battleship turrets target independently and staggers every barrel in an eight-second broadside cycle', () => {
    const battleship = {
      ...createShip('battleship', 'battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: []
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const targets = BATTLESHIP_TURRET_NAMES.map((name, index) => {
      const isFore = name.startsWith('fore')
      return createShip('destroyer', `${name}-target`, 'player2', isFore ? 18 : 2, 8 + index * 0.02)
    })

    BATTLESHIP_TURRET_NAMES.forEach((name, index) => {
      const point = getBattleshipTurretWorldPoint(battleship, name)
      expect(selectBattleshipTurret(battleship, point.x, point.y)).toBe(name)
      expect(setBattleshipTarget(battleship, targets[index])).toBe(true)
      battleship.batteries[name].direction = name.startsWith('fore') ? 0 : Math.PI
    })

    const bullets = []
    updateNavalFleet([battleship, ...targets], bullets, createMap(), { occupancyMap: [], explosions: [] }, 4000, 16)
    expect(bullets.map(bullet => bullet.id)).toEqual([expect.stringContaining('-foreOuter-0-')])
    expect(battleship.batteries.foreOuter.barrelRecoilStartTimes[0]).toBe(4000)

    ;[4300, 5000, 5300, 6000, 6300, 7000, 7300].forEach(now => {
      updateNavalFleet([battleship, ...targets], bullets, createMap(), { occupancyMap: [], explosions: [] }, now, 16)
    })

    BATTLESHIP_TURRET_NAMES.forEach((name, index) => {
      expect(battleship.batteries[name].targetId).toBe(targets[index].id)
      expect(bullets.filter(bullet => bullet.id.includes(`-${name}-`))).toHaveLength(2)
    })
    expect(bullets).toHaveLength(8)

    updateNavalFleet([battleship, ...targets], bullets, createMap(), { occupancyMap: [], explosions: [] }, 11999, 16)
    expect(bullets).toHaveLength(8)
    updateNavalFleet([battleship, ...targets], bullets, createMap(), { occupancyMap: [], explosions: [] }, 12000, 16)
    expect(bullets).toHaveLength(9)
  })

  it('hydrates battleship turret state once and preserves every hot-loop object identity', () => {
    const battleship = {
      ...createShip('battleship', 'stable-batteries', 'player1'),
      batteries: {
        fore: { targetId: 'legacy-fore' },
        aft: { targetId: 'legacy-aft' }
      }
    }

    const batteries = ensureBattleshipTurrets(battleship)
    const turretReferences = BATTLESHIP_TURRET_NAMES.map(name => batteries[name])
    const recoilReferences = BATTLESHIP_TURRET_NAMES.map(name => batteries[name].barrelRecoilStartTimes)
    const flashReferences = BATTLESHIP_TURRET_NAMES.map(name => batteries[name].muzzleFlashStartTimes)

    for (let frame = 0; frame < 1000; frame++) ensureBattleshipTurrets(battleship)

    expect(battleship.batteries).toBe(batteries)
    BATTLESHIP_TURRET_NAMES.forEach((name, index) => {
      expect(battleship.batteries[name]).toBe(turretReferences[index])
      expect(battleship.batteries[name].barrelRecoilStartTimes).toBe(recoilReferences[index])
      expect(battleship.batteries[name].muzzleFlashStartTimes).toBe(flashReferences[index])
    })
  })

  it('turns the hull side-on for a hull-issued target and exposes tower-blocked turret arcs', () => {
    const battleship = {
      ...createShip('battleship', 'battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: [],
      rotationSpeed: 0.1
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const target = createShip('destroyer', 'east-target', 'player2', 18, 8)
    expect(setBattleshipTarget(battleship, target)).toBe(true)

    for (let frame = 0; frame < 20; frame++) {
      updateNavalFleet([battleship, target], [], createMap(), { occupancyMap: [], explosions: [] }, 1000 + frame * 16, 16)
    }
    expect(Math.abs(Math.cos(battleship.direction))).toBeLessThan(0.06)

    const blockedArc = getBattleshipTurretBlockedArc(battleship, 'foreInner')
    expect(isBattleshipTurretAngleBlocked(battleship, 'foreInner', blockedArc.centerAngle)).toBe(true)
    expect(isBattleshipTurretAngleBlocked(battleship, 'foreInner', blockedArc.centerAngle + Math.PI / 2)).toBe(false)
  })

  it('keeps a commanded battleship path and fires only tower-clear turrets at its retained target', () => {
    const battleship = {
      ...createShip('battleship', 'mobile-battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: [],
      moveTarget: { x: 12, y: 8 },
      path: [{ x: 9, y: 8 }, { x: 10, y: 8 }]
    }
    battleship.movement.isMoving = true
    battleship.batteries = createBattleshipTurrets(battleship)
    const target = createShip('destroyer', 'mobile-target', 'player2', 18, 8)
    expect(setBattleshipTarget(battleship, target)).toBe(true)

    const originalPath = [...battleship.path]
    const bullets = []
    updateNavalFleet([battleship, target], bullets, createMap(), { occupancyMap: [], explosions: [] }, 4000, 16)

    expect(battleship.path).toEqual(originalPath)
    expect(battleship.moveTarget).toEqual({ x: 12, y: 8 })
    expect(battleship.target).toBe(target)
    expect(battleship.direction).toBe(0)
    expect(bullets).toHaveLength(1)
    expect(bullets[0].id).toContain('-foreOuter-0-')
    expect(battleship.batteries.aftInner.scheduledAt).toBeNull()
    expect(battleship.batteries.aftOuter.scheduledAt).toBeNull()
  })

  it('lets remote helm control override broadside turning while turrets continue attacking', () => {
    const battleship = {
      ...createShip('battleship', 'remote-battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: [],
      remoteControlActive: true
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const target = createShip('destroyer', 'remote-target', 'player2', 18, 8)
    expect(setBattleshipTarget(battleship, target)).toBe(true)

    const bullets = []
    updateNavalFleet([battleship, target], bullets, createMap(), { occupancyMap: [], explosions: [] }, 4000, 16)

    expect(battleship.direction).toBe(0)
    expect(battleship.target).toBe(target)
    expect(bullets).toHaveLength(1)
    expect(bullets[0].id).toContain('-foreOuter-0-')
  })

  it('clears every battleship target and pending barrel when fire control is stopped', () => {
    const battleship = {
      ...createShip('battleship', 'stopped-battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: []
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const target = createShip('destroyer', 'stopped-target', 'player2', 18, 8)
    expect(setBattleshipTarget(battleship, target)).toBe(true)
    updateNavalFleet([battleship, target], [], createMap(), { occupancyMap: [], explosions: [] }, 4000, 16)

    expect(clearBattleshipFireControl(battleship)).toBe(true)
    expect(battleship.target).toBeNull()
    expect(battleship.lastHullTargetId).toBeNull()
    BATTLESHIP_TURRET_NAMES.forEach(name => {
      expect(battleship.batteries[name].targetId).toBeNull()
      expect(battleship.batteries[name].scheduledAt).toBeNull()
      expect(battleship.batteries[name].nextBarrelIndex).toBe(0)
    })

    const bullets = []
    updateNavalFleet([battleship, target], bullets, createMap(), { occupancyMap: [], explosions: [] }, 4300, 16)
    expect(bullets).toEqual([])
  })

  it('uses the expanded battleship range and limits submarines to ships and partly-water Shipyards', () => {
    const battleship = createShip('battleship', 'battle', 'player1')
    expect(getEffectiveFireRange(battleship)).toBe(TILE_SIZE * 36)

    const submarine = createShip('submarine', 'sub', 'player1')
    const shipyard = { id: 'yard', type: 'shipyard', owner: 'player2', x: 12, y: 8, width: 4, height: 4, health: 1000 }
    const landUnit = { id: 'tank', type: 'tank_v1', owner: 'player2', x: 12 * TILE_SIZE, y: 8 * TILE_SIZE, tileX: 12, tileY: 8, health: 100 }
    expect(canUnitTargetEntity(submarine, shipyard)).toBe(true)
    expect(canUnitTargetEntity(submarine, landUnit)).toBe(false)
    expect(canUnitTargetEntity(battleship, landUnit)).toBe(true)
  })

  it('lets surface battleships shell land buildings and submarines torpedo eligible yard buildings', () => {
    const landBuilding = { id: 'plant', type: 'powerPlant', owner: 'player2', x: 18, y: 8, width: 2, height: 2, health: 200 }
    const shipyard = { id: 'yard', type: 'shipyard', owner: 'player2', x: 12, y: 8, width: 4, height: 4, health: 1000 }
    gameState.buildings = [landBuilding, shipyard]

    const battleship = {
      ...createShip('battleship', 'battle', 'player1'),
      selectedTurret: 'foreOuter',
      turretDamageOrder: []
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const mount = getBattleshipTurretWorldPoint(battleship, 'foreOuter')
    const buildingCenter = {
      x: (landBuilding.x + landBuilding.width / 2) * TILE_SIZE,
      y: (landBuilding.y + landBuilding.height / 2) * TILE_SIZE
    }
    battleship.batteries.foreOuter.direction = Math.atan2(buildingCenter.y - mount.y, buildingCenter.x - mount.x)
    expect(setBattleshipTarget(battleship, landBuilding)).toBe(true)
    const shells = []
    updateNavalFleet([battleship], shells, createMap(), { occupancyMap: [], explosions: [] }, 4000, 16)
    expect(shells).toHaveLength(1)
    expect(shells[0].target).toBe(landBuilding)

    const submarine = {
      ...createShip('submarine', 'sub', 'player1'),
      depthState: 'surfaced',
      depthTransitionProgress: 1,
      detectedByOwners: {},
      lastTorpedoTime: 0,
      target: shipyard
    }
    const torpedoes = []
    const submarineFireTime = SUBMARINE_TORPEDO_COOLDOWN + 1
    updateNavalFleet([submarine], torpedoes, createMap(), { occupancyMap: [], explosions: [] }, submarineFireTime, 16)
    expect(torpedoes).toHaveLength(1)
    expect(torpedoes[0]).toMatchObject({ target: shipyard, navalOnly: false, strictTarget: true })

    submarine.target = landBuilding
    updateNavalFleet([submarine], torpedoes, createMap(), { occupancyMap: [], explosions: [] }, submarineFireTime + 3000, 16)
    expect(submarine.target).toBeNull()
    expect(torpedoes).toHaveLength(1)
  })

  it('assigns a hull-selected battleship target to all four turrets', () => {
    const battleship = {
      ...createShip('battleship', 'battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: []
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const target = createShip('destroyer', 'shared-target', 'player2', 12, 8)

    expect(selectBattleshipTurret(
      battleship,
      battleship.x + TILE_SIZE / 2,
      battleship.y + TILE_SIZE / 2
    )).toBeNull()
    expect(setBattleshipTarget(battleship, target)).toBe(true)

    BATTLESHIP_TURRET_NAMES.forEach(name => {
      expect(battleship.batteries[name].targetId).toBe(target.id)
    })
  })

  it('disables a random remaining turret at each 20% damage threshold and restores them in reverse order', () => {
    const battleship = {
      ...createShip('battleship', 'battle', 'player1'),
      selectedTurret: null,
      turretDamageOrder: []
    }
    battleship.batteries = createBattleshipTurrets(battleship)
    const state = { occupancyMap: [], explosions: [] }

    battleship.health = battleship.maxHealth * 0.79
    updateNavalFleet([battleship], [], createMap(), state, 1000, 16)
    expect(battleship.turretDamageOrder).toHaveLength(1)
    expect(state.explosions).toHaveLength(1)
    const firstDisabled = battleship.turretDamageOrder[0]
    expect(battleship.batteries[firstDisabled].enabled).toBe(false)

    battleship.health = battleship.maxHealth * 0.59
    updateNavalFleet([battleship], [], createMap(), state, 2000, 16)
    expect(battleship.turretDamageOrder).toHaveLength(2)
    expect(new Set(battleship.turretDamageOrder).size).toBe(2)
    expect(state.explosions).toHaveLength(2)
    const secondDisabled = battleship.turretDamageOrder[1]

    battleship.health = battleship.maxHealth * 0.61
    updateNavalFleet([battleship], [], createMap(), state, 3000, 16)
    expect(battleship.turretDamageOrder).toEqual([firstDisabled])
    expect(battleship.batteries[firstDisabled].enabled).toBe(false)
    expect(battleship.batteries[secondDisabled].enabled).toBe(true)

    battleship.health = battleship.maxHealth * 0.81
    updateNavalFleet([battleship], [], createMap(), state, 4000, 16)
    expect(battleship.turretDamageOrder).toEqual([])
    expect(BATTLESHIP_TURRET_NAMES.every(name => battleship.batteries[name].enabled)).toBe(true)
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
    expect(bullets).toHaveLength(0)

    updateNavalFleet(units, bullets, map, { occupancyMap: [] }, 5201, 16)
    expect(bullets).toHaveLength(1)
    expect(bullets[0]).toMatchObject({ projectileType: 'torpedo', navalOnly: true, strictTarget: true })
  })

  it('lets surfaced submarines torpedo enemy yards with strict target collision', () => {
    const submarine = {
      ...createShip('submarine', 'sub', 'player1', 8, 8),
      depthState: 'surfaced',
      depthTransitionProgress: 1,
      detectedByOwners: {},
      lastTorpedoTime: 0,
      ammunition: 4
    }
    const yard = {
      id: 'enemy-yard',
      type: 'constructionYard',
      owner: 'player2',
      isBuilding: true,
      x: 9,
      y: 8,
      width: 3,
      height: 3,
      health: 1000
    }
    const bullets = []
    const submarineFireTime = SUBMARINE_TORPEDO_COOLDOWN + 1

    updateNavalFleet([submarine], bullets, createMap(), { occupancyMap: [], buildings: [yard] }, 4000, 16)
    expect(bullets).toHaveLength(0)

    submarine.target = yard
    updateNavalFleet([submarine], bullets, createMap(), { occupancyMap: [], buildings: [yard] }, submarineFireTime, 16)

    expect(bullets).toHaveLength(1)
    expect(bullets[0]).toMatchObject({
      projectileType: 'torpedo',
      target: yard,
      navalOnly: false,
      strictTarget: true
    })
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
