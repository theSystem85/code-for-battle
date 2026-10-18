import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateHospitalLogic } from '../../src/game/hospitalLogic.js'
import { getServiceRadiusPixels } from '../../src/utils/serviceRadius.js'

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: fn => fn
}))

vi.mock('../../src/utils/serviceRadius.js', () => ({
  getServiceRadiusPixels: vi.fn()
}))

function createHospital({ x = 10, y = 10, owner = 'player1', healingUnits } = {}) {
  return {
    id: `hospital_${x}_${y}`,
    type: 'hospital',
    x,
    y,
    width: 3,
    height: 3,
    owner,
    healingUnits
  }
}

function createCrewUnit({
  id = 'unit1',
  type = 'tank_v1',
  owner = 'player1',
  tileX = 10,
  tileY = 13,
  crew = { driver: true, commander: true, loader: true, gunner: true }
} = {}) {
  return {
    id,
    type,
    owner,
    tileX,
    tileY,
    crew
  }
}

function createAmbulance({
  id = 'ambulance1',
  owner = 'player1',
  tileX = 10,
  tileY = 13,
  medics = 4,
  maxMedics = 6,
  medicRefillTimer = 0
} = {}) {
  return {
    id,
    type: 'ambulance',
    owner,
    tileX,
    tileY,
    medics,
    maxMedics,
    medicRefillTimer
  }
}

describe('hospitalLogic', () => {
  let gameState

  beforeEach(() => {
    gameState = {
      humanPlayer: 'player1',
      money: 100
    }
    getServiceRadiusPixels.mockReturnValue(96)
  })

  it('[U01994] leaves units untouched when no hospitals exist', () => {
    const unit = createCrewUnit({ crew: { driver: false, commander: true, loader: true, gunner: true } })

    updateHospitalLogic([unit], [], gameState, 1000)

    expect(unit.crew.driver).toBe(false)
    expect(gameState.money).toBe(100)
  })

  it('[U01995] skips healing when hospital service radius is zero', () => {
    const hospital = createHospital({ healingUnits: [{ unitId: 'unit1' }] })
    getServiceRadiusPixels.mockReturnValueOnce(0)

    updateHospitalLogic([], [hospital], gameState, 1000)

    expect(hospital.healingUnits).toEqual([{ unitId: 'unit1' }])
  })

  it('[U01996] creates healing entries and advances crew roles with money deduction', () => {
    const hospital = createHospital()
    const unit = createCrewUnit({
      crew: { driver: false, commander: false, loader: true, gunner: true }
    })

    updateHospitalLogic([unit], [hospital], gameState, 10000)

    expect(unit.crew.driver).toBe(true)
    expect(gameState.money).toBe(90)
    expect(hospital.healingUnits).toHaveLength(1)
    expect(hospital.healingUnits[0]).toMatchObject({
      unitId: unit.id,
      currentRole: 'commander',
      progress: 0
    })
  })

  it('[U01997] heals crew even when funds are low without deducting money', () => {
    gameState.money = 5
    const hospital = createHospital()
    const unit = createCrewUnit({ crew: { driver: false, commander: true, loader: true, gunner: true } })

    updateHospitalLogic([unit], [hospital], gameState, 10000)

    expect(unit.crew.driver).toBe(true)
    expect(gameState.money).toBe(5)
    expect(hospital.healingUnits).toHaveLength(0)
  })

  it('[U01998] removes healing entries when units leave the service radius', () => {
    const hospital = createHospital({
      healingUnits: [{ unitId: 'unit1', progress: 0, totalProgress: 10000, currentRole: 'driver' }]
    })
    const unit = createCrewUnit({ tileY: 20 })

    updateHospitalLogic([unit], [hospital], gameState, 1000)

    expect(hospital.healingUnits).toHaveLength(0)
  })

  it('[U01999] does not enroll AI ambulances in crew healing', () => {
    const hospital = createHospital()
    const unit = createCrewUnit({
      id: 'amb1',
      type: 'ambulance',
      owner: 'ai',
      crew: { driver: false, commander: true, loader: true, gunner: true }
    })

    updateHospitalLogic([unit], [hospital], gameState, 1000)

    expect(hospital.healingUnits).toHaveLength(0)
  })

  it('[U02000] refills ambulance medics over time while in range', () => {
    const hospital = createHospital({ owner: 'player1' })
    const ambulance = createAmbulance({ medics: 4, maxMedics: 6, medicRefillTimer: 0 })

    updateHospitalLogic([ambulance], [hospital], gameState, 4000)

    expect(ambulance.medics).toBe(6)
    expect(ambulance.medicRefillTimer).toBe(0)
  })

  it('[U02001] resets ambulance refill timer when out of range', () => {
    const hospital = createHospital({ owner: 'player1' })
    const ambulance = createAmbulance({ tileY: 20, medicRefillTimer: 1000 })

    updateHospitalLogic([ambulance], [hospital], gameState, 2000)

    expect(ambulance.medicRefillTimer).toBe(0)
  })

  it('[U02002] advances healing entries without deducting money for AI units', () => {
    const hospital = createHospital({
      healingUnits: [{ unitId: 'unit1', progress: 9000, totalProgress: 10000, currentRole: 'driver' }]
    })
    const unit = createCrewUnit({
      owner: 'ai',
      crew: { driver: false, commander: false, loader: true, gunner: true }
    })

    updateHospitalLogic([unit], [hospital], gameState, 2000)

    expect(unit.crew.driver).toBe(true)
    expect(gameState.money).toBe(100)
    expect(hospital.healingUnits[0].currentRole).toBe('commander')
  })
})
