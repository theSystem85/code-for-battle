import { it, expect, vi } from 'vitest'
vi.mock('../../src/main.js', () => ({ units: [], factories: [], bullets: [] }))
vi.mock('../../src/inputHandler.js', () => ({ selectedUnits: [], cleanupDestroyedSelectedUnits: vi.fn() }))
vi.mock('../../src/sound.js', () => ({ playSound: vi.fn(), playPositionalSound: vi.fn(() => Promise.resolve(null)), audioContext: null, getMasterVolume: () => 0 }))
import { createUnit } from '../../src/units.js'
import { createBuilding, placeBuilding } from '../../src/buildings.js'
import { updateUnitMovement } from '../../src/game/unitMovement.js'
import { updateHelipadLogic } from '../../src/game/helipadLogic.js'
import { updateHospitalLogic } from '../../src/game/hospitalLogic.js'
import { manageAICrewHealing } from '../../src/ai/crewHealing.js'
import { updateGlobalPathfinding } from '../../src/game/pathfinding.js'
import { updateAIUnit } from '../../src/ai/enemyUnitBehavior.js'
import { gameState } from '../../src/gameState.js'

function arena() {
  gameState.mapGrid = Array.from({ length: 48 }, () => Array.from({ length: 48 }, () => ({ type: 'land' })))
  gameState.occupancyMap = Array.from({ length: 48 }, () => Array(48).fill(0))
  gameState.humanPlayer = 'player1'
  gameState.buildings = []
  gameState.partyStates = []
  return gameState
}
it('keeps sequential Apache landings stable with two helipads in the service loop', () => {
  const gs = arena()
  const pad = createBuilding('helipad', 22, 22)
  pad.owner = 'player1'
  placeBuilding(pad, gs.mapGrid, gs.occupancyMap)
  gs.buildings.push(pad)
  const alternate = createBuilding('helipad', 28, 22)
  alternate.owner = 'player1'
  placeBuilding(alternate, gs.mapGrid, gs.occupancyMap)
  gs.buildings.push(alternate)
  const heli = createUnit({ id: 'player1' }, 'apache', 22, 25)
  heli.helipadLandingRequested = true
  heli.helipadTargetId = pad.id
  heli.flightPlan = { x: 22 * 32 + 25, y: 22 * 32 + 44, mode: 'helipad', stopRadius: 6.4 }
  heli.moveTarget = { x: 22, y: 23 }
  heli.manualFlightState = 'takeoff'
  heli.autoHoldAltitude = true
  for (let now = 16; now < 30000; now += 16) {
    gs.simulationTime = now
    updateUnitMovement([heli], gs.mapGrid, gs.occupancyMap, gs, now)
    updateHelipadLogic([heli], gs.buildings, gs, 16)
    updateGlobalPathfinding([heli], gs.mapGrid, gs.occupancyMap, gs)
  }
  expect({ landed: heli.landedHelipadId, flight: heli.flightState, x: heli.x, y: heli.y, movement: heli.movement }, JSON.stringify(heli)).toMatchObject({ landed: pad.id, flight: 'grounded' })
  const second = createUnit({ id: 'player1' }, 'apache', 30, 30)
  second.helipadLandingRequested = true
  second.helipadTargetId = alternate.id
  second.flightPlan = { x: 28 * 32 + 25, y: 22 * 32 + 44, mode: 'helipad', stopRadius: 6.4 }
  second.moveTarget = { x: 28, y: 23 }
  second.manualFlightState = 'takeoff'
  second.autoHoldAltitude = true
  const aircraft = [heli, second]
  for (let now = 30000; now < 60000; now += 16) {
    gs.simulationTime = now
    updateUnitMovement(aircraft, gs.mapGrid, gs.occupancyMap, gs, now)
    updateHelipadLogic(aircraft, gs.buildings, gs, 16)
    updateGlobalPathfinding(aircraft, gs.mapGrid, gs.occupancyMap, gs)
    expect(heli.landedHelipadId).toBe(pad.id)
  }
  expect(second.landedHelipadId).toBe(alternate.id)
  expect(pad.landedUnitId).toBe(heli.id)
  expect(alternate.landedUnitId).toBe(second.id)
})
it('restores enemy crew after a real hospital route', () => {
  const gs = arena()
  const hospital = createBuilding('hospital', 24, 24)
  hospital.owner = 'player2'
  placeBuilding(hospital, gs.mapGrid, gs.occupancyMap)
  gs.buildings.push(hospital)
  const tank = createUnit({ id: 'player2' }, 'tank_v1', 24, 36)
  tank.crew.gunner = false
  tank.needsHospital = true
  manageAICrewHealing([tank], gs, 6000, 'player2')
  expect(tank.moveTarget).toEqual({ x: 25, y: 28 })
  for (let now = 6016; now < 66000; now += 16) {
    gs.simulationTime = now
    manageAICrewHealing([tank], gs, now, 'player2')
    updateAIUnit(tank, [tank], gs, gs.mapGrid, now, 'player2', [], [])
    updateUnitMovement([tank], gs.mapGrid, gs.occupancyMap, gs, now)
    updateHospitalLogic([tank], gs.buildings, gs, 16)
    updateGlobalPathfinding([tank], gs.mapGrid, gs.occupancyMap, gs)
  }
  expect(tank.returningToHospital).toBe(false)
  expect(tank.needsHospital).toBe(false)
  expect({ crew: tank.crew, x: tank.x, y: tank.y, moveTarget: tank.moveTarget, path: tank.path, healing: hospital.healingUnits }).toMatchObject({ crew: { gunner: true } })
})

it('fires a tank and turret after removing the intervening building', async() => {
  const { updateUnitCombat } = await import('../../src/game/unitCombat.js')
  const { updateBuildings } = await import('../../src/game/buildingSystem.js')
  const gs = arena()
  const turret = createBuilding('turretGunV1', 22, 22)
  turret.owner = 'player1'
  const blocker = createBuilding('powerPlant', 25, 22)
  blocker.owner = 'player1'
  for (const b of [turret, blocker]) { placeBuilding(b, gs.mapGrid, gs.occupancyMap); gs.buildings.push(b) }
  const enemy = createUnit({ id: 'player2' }, 'tank_v1', 29, 22)
  enemy.crew = { driver: false, commander: false, loader: false, gunner: false }
  const tank = createUnit({ id: 'player1' }, 'tank-v2', 22, 23)
  tank.crew.driver = false
  tank.alertMode = true
  tank.target = enemy
  tank.ammunition = turret.ammo = 100
  const units = [tank, enemy]
  const bullets = []
  for (let now = 16; now < 6000; now += 16) {
    gs.simulationTime = now
    updateUnitMovement(units, gs.mapGrid, gs.occupancyMap, gs, now)
    updateUnitCombat(units, bullets, gs.mapGrid, gs, now)
    updateBuildings(gs, units, bullets, [], gs.mapGrid, 16)
  }
  expect([tank.ammunition, turret.ammo]).toEqual([100, 100])
  gs.buildings.splice(gs.buildings.indexOf(blocker), 1)
  for (const row of gs.mapGrid) for (const tile of row) if (tile.building === blocker) tile.building = null
  for (let now = 6000; now < 21000; now += 16) {
    gs.simulationTime = now
    updateUnitMovement(units, gs.mapGrid, gs.occupancyMap, gs, now)
    updateUnitCombat(units, bullets, gs.mapGrid, gs, now)
    updateBuildings(gs, units, bullets, [], gs.mapGrid, 16)
  }
  expect({ tankAmmo: tank.ammunition, turretAmmo: turret.ammo, tankTarget: tank.target?.id, enemy: enemy.id }).toMatchObject({ tankAmmo: expect.any(Number), turretAmmo: expect.any(Number) })
  expect(tank.ammunition, JSON.stringify({ tank, turret })).toBeLessThan(100)
  expect(turret.ammo, JSON.stringify({ tank, turret })).toBeLessThan(100)
})

it('launches rockets and detonates against an airborne Apache using real movement and projectile updates', async() => {
  const { updateUnitCombat } = await import('../../src/game/unitCombat.js')
  const { updateBullets } = await import('../../src/game/bulletSystem.js')
  const gs = arena()
  const rocket = createUnit({ id: 'player1' }, 'rocketTank', 22, 24)
  const apache = createUnit({ id: 'player2' }, 'apache', 27, 24)
  apache.flightState = 'airborne'
  apache.altitude = apache.maxAltitude
  apache.manualFlightState = 'hover'
  apache.autoHoldAltitude = true
  apache.dodgeChance = 0
  apache.health = apache.maxHealth = 10000
  rocket.target = apache
  const units = [rocket, apache]
  const bullets = []
  for (let now = 16; now < 20000 && apache.health === 10000; now += 16) {
    gs.simulationTime = now
    updateUnitMovement(units, gs.mapGrid, gs.occupancyMap, gs, now)
    updateUnitCombat(units, bullets, gs.mapGrid, gs, now)
    updateBullets(bullets, units, [], gs, gs.mapGrid)
  }
  expect(apache.flightState).not.toBe('grounded')
  expect(apache.health, JSON.stringify({ ammo: rocket.ammunition, heading: rocket.direction, turret: rocket.turretDirection, bullets: bullets.length })).toBeLessThan(10000)
})
