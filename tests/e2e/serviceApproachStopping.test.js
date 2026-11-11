import { test, expect } from '@playwright/test'

test('[E00256] commanded ambulance heals without pushing a stationary patient on a street', async({ page }) => {
  await page.goto('/?seed=17')
  await page.waitForSelector('#gameCanvas', { state: 'visible' })
  const result = await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { assignAmbulanceToTarget } = await import('/src/input/unitCommands/utilityQueue.js')
    const { initializeUnitMovement, updateUnitPosition } = await import('/src/game/movementCore.js')
    const { updateAmbulanceLogic } = await import('/src/game/ambulanceSystem.js')
    const { SERVICE_SERVING_RANGE, TILE_SIZE } = await import('/src/config.js')
    gameState.gamePaused = true
    const map = Array.from({ length: 24 }, () => Array.from({ length: 24 }, () => ({ type: 'street' })))
    gameState.occupancyMap = Array.from({ length: 24 }, () => Array(24).fill(0))
    const patient = {
      id: 'service-patient', type: 'tank_v1', owner: 'player1', health: 100, maxHealth: 100,
      x: 16 * TILE_SIZE, y: 10 * TILE_SIZE, tileX: 16, tileY: 10,
      crew: { driver: true, commander: true, loader: true, gunner: false }, path: [], moveTarget: null
    }
    const ambulance = {
      id: 'service-provider', type: 'ambulance', owner: 'player1', health: 100,
      x: 5 * TILE_SIZE, y: 10 * TILE_SIZE, tileX: 5, tileY: 10,
      direction: 0, speedModifier: 3, medics: 5,
      crew: { driver: true, commander: true, loader: true, gunner: true }, path: []
    }
    initializeUnitMovement(patient)
    initializeUnitMovement(ambulance)
    gameState.occupancyMap[10][16] = 1
    gameState.occupancyMap[10][5] = 1
    const assigned = assignAmbulanceToTarget(ambulance, patient, map, { suppressNotifications: true })
    const state = { buildings: [], unitWrecks: [], mapGrid: map }
    let minimumDistance = Infinity
    let patientDisplaced = false
    for (let tick = 0; tick < 1200; tick++) {
      updateUnitPosition(ambulance, map, gameState.occupancyMap, tick * 16, [ambulance, patient], state)
      updateUnitPosition(patient, map, gameState.occupancyMap, tick * 16, [ambulance, patient], state)
      updateAmbulanceLogic([ambulance, patient], state, 16)
      minimumDistance = Math.min(minimumDistance, Math.hypot(ambulance.x - patient.x, ambulance.y - patient.y))
      patientDisplaced ||= patient.x !== 16 * TILE_SIZE || patient.y !== 10 * TILE_SIZE || Boolean(patient.moveTarget)
    }
    return {
      assigned, healed: patient.crew.gunner, patientDisplaced, minimumDistance,
      range: SERVICE_SERVING_RANGE * TILE_SIZE,
      stopped: !ambulance.movement.isMoving && ambulance.path.length === 0 && ambulance.moveTarget === null
    }
  })
  expect(result.assigned).toBe(true)
  expect(result.healed).toBe(true)
  expect(result.patientDisplaced).toBe(false)
  expect(result.stopped).toBe(true)
  expect(result.minimumDistance).toBeGreaterThanOrEqual(result.range - 0.002)
  expect(result.minimumDistance).toBeLessThanOrEqual(result.range + 0.001)
})
