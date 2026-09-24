import { describe, it, expect, afterEach } from 'vitest'

import { buildingData } from '../../../src/data/buildingData.js'
import { LANDING_LOCALE_STORAGE_KEY } from '../../../src/landing/landingLocale.js'
import { fullBaseTest } from '../../../src/missions/mission_full_base_test.js'
import { mission01 } from '../../../src/missions/mission_01.js'
import { localizeMission, missionText } from '../../../src/missions/missionText.js'

const PLAYER = 'player1'
const ENEMY = 'player2'
const TILE_SIZE = 32
const OPENING_COST = buildingData.powerPlant.cost
  + buildingData.oreRefinery.cost
  + buildingData.vehicleFactory.cost
  + 1500

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

describe('Mission 01 Fordline', () => {
  const state = JSON.parse(mission01.state)
  const buildings = state.buildings
  const units = state.units

  afterEach(() => {
    localStorage.removeItem(LANDING_LOCALE_STORAGE_KEY)
  })

  it('keeps the first-mission id and replaces the old siege content', () => {
    expect(mission01.id).toBe('Mission_01')
    expect(mission01.label).toBe('Mission 01: Fordline')
    expect(mission01.description).toContain('Ashford ford')
    expect(mission01.description).not.toContain('Scarlet')
    expect(mission01.introVideo).toBe('mission_01_intro.mp4')
    expect(mission01.introAudio).toBe('mission_01_intro.mp3')
    expect(mission01.time).toBe(Date.UTC(2025, 0, 1))
    expect(mission01.time).toBeGreaterThan(fullBaseTest.time)
    expect(fullBaseTest.introVideo).toBeUndefined()
  })

  it('localizes the briefing in English and German', () => {
    localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, 'en')
    const english = localizeMission(mission01, 'en')
    expect(english.label).toBe(mission01.label)
    expect(english.objectives).toHaveLength(3)
    expect(english.objectives[0]).toContain('Power Plant')

    localStorage.setItem(LANDING_LOCALE_STORAGE_KEY, 'de')
    const german = localizeMission(mission01, 'de')
    expect(german.label).toBe('Mission 01: Furtlinie')
    expect(german.description).toContain('Ashford')
    expect(german.objectives[2]).toContain('Furt')
    expect(german.objectives[2]).toContain('Öffnung')
    expect(english.description).toContain('walled outpost')
    expect(german.description).toContain('umwallten Außenposten')
    expect(missionText('missions.intro.skip', 'de')).toBe('Überspringen')
  })

  it('starts the player with a yard, one tank, and credits for the opening chain', () => {
    const playerBuildings = buildings.filter(building => building.owner === PLAYER)
    const playerUnits = units.filter(unit => unit.owner === PLAYER)

    expect(state.gameState.humanPlayer).toBe(PLAYER)
    expect(state.gameState.money).toBe(11000)
    expect(state.gameState.money).toBeGreaterThanOrEqual(OPENING_COST)
    expect(state.gameState.playerPowerSupply).toBeGreaterThan(0)
    expect(state.gameState.achievedMilestones).toEqual([])
    expect(playerBuildings.map(building => building.type)).toEqual(['constructionYard'])
    expect(playerBuildings[0].id).toBe(PLAYER)
    expect(playerUnits.map(unit => unit.type)).toEqual(['tank_v1'])
    expect(state.gameState.availableBuildingTypes).toEqual(expect.arrayContaining([
      'powerPlant',
      'oreRefinery',
      'vehicleFactory'
    ]))
  })

  it('fields a walled camp instead of a fortress', () => {
    const enemyBuildings = buildings.filter(building => building.owner === ENEMY)
    const enemyTypes = [...new Set(enemyBuildings.map(building => building.type))].sort()
    expect(enemyTypes).toEqual(['concreteWall', 'constructionYard', 'oreRefinery', 'powerPlant', 'turretGunV1'].sort())
    expect(enemyBuildings.find(building => building.type === 'constructionYard').id).toBe(ENEMY)
    expect(enemyBuildings.filter(building => building.type === 'concreteWall').length).toBeGreaterThanOrEqual(40)
    expect(enemyBuildings.filter(building => building.type === 'concreteWall').length).toBeLessThanOrEqual(90)
    expect(enemyBuildings.filter(building => building.type === 'turretGunV1')).toHaveLength(2)
    expect(state.aiFactoryBudgets[ENEMY]).toBe(500)
    expect(state.gameState.enemyPowerSupply).toBeGreaterThan(0)
    expect(units.filter(unit => unit.owner === ENEMY && unit.type === 'tank_v1')).toHaveLength(2)
    expect(units.filter(unit => unit.owner === ENEMY && unit.type === 'harvester')).toHaveLength(1)
    expect(buildings.some(building => (
      building.type === 'teslaCoil'
      || building.type === 'artilleryTurret'
      || building.type === 'rocketTurret'
    ))).toBe(false)

    const southGate = []
    for (let x = 70; x <= 74; x++) southGate.push({ x, y: 30 })
    southGate.forEach(tile => {
      expect(buildings.some(building => building.x === tile.x && building.y === tile.y)).toBe(false)
      expect(state.mapGridTypes[tile.y][tile.x] === 'land' || state.mapGridTypes[tile.y][tile.x] === 'street').toBe(true)
    })
  })

  it('keeps visible land under the player yard', () => {
    for (let y = 78; y <= 80; y++) {
      for (let x = 14; x <= 16; x++) {
        expect(state.mapGridTypes[y][x]).toBe('land')
      }
    }
    let nearbyStreets = 0
    for (let y = 76; y <= 84; y++) {
      for (let x = 10; x <= 22; x++) {
        if (state.mapGridTypes[y][x] === 'street') nearbyStreets++
      }
    }
    expect(nearbyStreets).toBeLessThanOrEqual(24)
  })

  it('keeps a southern ore seam, a river ford, and a clear approach', () => {
    const playerOre = state.orePositions.filter(pos => pos.y > 60)
    const enemyOre = state.orePositions.filter(pos => pos.y < 40 && pos.x > 60)
    expect(playerOre.length).toBeGreaterThanOrEqual(12)
    expect(enemyOre.length).toBeGreaterThan(0)
    expect(enemyOre.length).toBeLessThan(playerOre.length)

    const river = state.mapGridTypes[50]
    expect(river.some(tile => tile === 'water')).toBe(true)
    expect(river.some(tile => tile === 'street')).toBe(true)

    buildings.forEach((building, index) => {
      buildings.slice(index + 1).forEach(other => {
        expect(overlaps(building, other)).toBe(false)
      })
      for (let y = building.y; y < building.y + building.height; y++) {
        for (let x = building.x; x < building.x + building.width; x++) {
          expect(state.mapGridTypes[y][x]).not.toBe('water')
          expect(state.mapGridTypes[y][x]).not.toBe('rock')
        }
      }
    })

    units.forEach(unit => {
      const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
      expect(unit.tileX).toBe(tileX)
      expect(unit.tileY).toBe(tileY)
      const terrain = state.mapGridTypes[tileY][tileX]
      expect(terrain === 'land' || terrain === 'street').toBe(true)
    })
  })
})
