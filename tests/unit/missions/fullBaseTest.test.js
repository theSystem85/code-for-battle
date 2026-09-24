import { describe, it, expect } from 'vitest'

import { buildingData } from '../../../src/data/buildingData.js'
import { UNIT_PROPERTIES } from '../../../src/config.js'
import { getShipyardWaterLocalTiles } from '../../../src/utils/navalUtils.js'
import { fullBaseTest } from '../../../src/missions/mission_full_base_test.js'
import { builtinMissions, getBuiltinMissionById } from '../../../src/missions/index.js'

const PLAYER = 'player1'
const ENEMY = 'player2'
const AIR_UNIT_TYPES = new Set(['apache', 'f22Raptor', 'f35'])

function playerPower(buildings) {
  let supply = 0
  let production = 0
  let consumption = 0
  buildings.forEach(building => {
    if (building.owner !== PLAYER || building.health <= 0) return
    if (building.type === 'constructionYard') {
      supply += buildingData.constructionYard.power
      production += buildingData.constructionYard.power
    }
    const power = building.power || 0
    supply += power
    if (power > 0) production += power
    if (power < 0) consumption += Math.abs(power)
  })
  return { supply, production, consumption }
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

describe('Full Base Test locked save', () => {
  const state = JSON.parse(fullBaseTest.state)
  const buildings = state.buildings
  const units = state.units
  const playerBuildings = buildings.filter(building => building.owner === PLAYER)
  const enemyBuildings = buildings.filter(building => building.owner === ENEMY)
  const playableUnitTypes = Object.keys(UNIT_PROPERTIES).filter(type => type !== 'base')

  it('is registered as a locked builtin save without replacing Mission 01', () => {
    expect(builtinMissions.map(mission => mission.id)).toEqual(['Mission_01', 'Full_Base_Test'])
    expect(getBuiltinMissionById('Mission_01').label).toBe('Mission 01: Midnight Siege')
    expect(getBuiltinMissionById('Full_Base_Test')).toBe(fullBaseTest)
    expect(fullBaseTest.label).toBe('Full Base Test')
    expect(fullBaseTest.description).toMatch(/Locked test save/)
    expect(fullBaseTest.time).toBeLessThan(getBuiltinMissionById('Mission_01').time)
  })

  it('gives the local player one of every building, with enough power and a finished base', () => {
    const counts = new Map()
    playerBuildings.forEach(building => {
      counts.set(building.type, (counts.get(building.type) || 0) + 1)
      expect(building.constructionFinished).toBe(true)
      expect(building.health).toBeGreaterThan(0)
    })

    Object.keys(buildingData).forEach(type => {
      expect(counts.get(type) || 0).toBeGreaterThan(0)
    })
    counts.forEach((count, type) => {
      if (type !== 'powerPlant') expect(count).toBe(1)
    })

    const power = playerPower(playerBuildings)
    expect(state.gameState.humanPlayer).toBe(PLAYER)
    expect(state.gameState.playerPowerSupply).toBe(power.supply)
    expect(power.supply).toBeGreaterThanOrEqual(0)
    expect(power.supply - buildingData.powerPlant.power).toBeLessThan(0)
    expect(playerBuildings.find(building => building.type === 'constructionYard').id).toBe(PLAYER)
    expect(state.gameState.availableBuildingTypes).toEqual(expect.arrayContaining(Object.keys(buildingData)))
  })

  it('places a coastal shipyard and an airstrip on a map that has open water', () => {
    const shipyard = playerBuildings.find(building => building.type === 'shipyard')
    const airstrip = playerBuildings.find(building => building.type === 'airstrip')
    expect(shipyard).toBeTruthy()
    expect(airstrip).toBeTruthy()

    const waterTiles = getShipyardWaterLocalTiles(shipyard.width, shipyard.height, 'south')
    const waterKeys = new Set(waterTiles.map(tile => `${tile.x},${tile.y}`))
    for (let localY = 0; localY < shipyard.height; localY++) {
      for (let localX = 0; localX < shipyard.width; localX++) {
        const tileType = state.mapGridTypes[shipyard.y + localY][shipyard.x + localX]
        expect(tileType).toBe(waterKeys.has(`${localX},${localY}`) ? 'water' : 'land')
      }
    }

    const launchY = shipyard.y + shipyard.height
    for (let x = shipyard.x; x < shipyard.x + shipyard.width; x++) {
      expect(state.mapGridTypes[launchY][x]).toBe('water')
    }

    const waterCount = state.mapGridTypes.flat().filter(type => type === 'water').length
    expect(waterCount).toBeGreaterThan(waterTiles.length + shipyard.width)
  })

  it('gives the local player one of every unit and the enemy only a construction yard', () => {
    expect(enemyBuildings).toHaveLength(1)
    expect(enemyBuildings[0]).toMatchObject({ type: 'constructionYard', owner: ENEMY, id: ENEMY })
    expect(units.filter(unit => unit.owner !== PLAYER)).toEqual([])
    expect(state.aiFactoryBudgets[ENEMY]).toBe(0)

    const counts = new Map()
    const tiles = new Set()
    units.forEach(unit => {
      counts.set(unit.type, (counts.get(unit.type) || 0) + 1)
      const tileKey = `${unit.tileX},${unit.tileY}`
      expect(tiles.has(tileKey)).toBe(false)
      tiles.add(tileKey)
      expect(unit.owner).toBe(PLAYER)
      expect(unit.health).toBeGreaterThan(0)
    })

    expect([...counts.keys()].sort()).toEqual([...playableUnitTypes].sort())
    counts.forEach(count => expect(count).toBe(1))
    expect(state.gameState.availableUnitTypes).toEqual(expect.arrayContaining(['tank', ...playableUnitTypes]))
  })

  it('keeps buildings and units from occupying the same tiles', () => {
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        expect(overlaps(buildings[i], buildings[j])).toBe(false)
      }
    }

    units.forEach(unit => {
      const onWater = state.mapGridTypes[unit.tileY][unit.tileX] === 'water'
      const naval = UNIT_PROPERTIES[unit.type].isNaval || UNIT_PROPERTIES[unit.type].movementType === 'water'
      if (naval) {
        expect(onWater).toBe(true)
      } else if (!AIR_UNIT_TYPES.has(unit.type)) {
        expect(onWater).toBe(false)
      }

      if (AIR_UNIT_TYPES.has(unit.type)) return
      const blocked = buildings.some(building => (
        unit.tileX >= building.x &&
        unit.tileX < building.x + building.width &&
        unit.tileY >= building.y &&
        unit.tileY < building.y + building.height
      ))
      expect(blocked).toBe(false)
    })

    const apache = units.find(unit => unit.type === 'apache')
    const helipad = playerBuildings.find(building => building.type === 'helipad')
    expect(helipad.landedUnitId).toBe(apache.id)
    expect(apache.landedHelipadId).toBe(helipad.id)

    const airstrip = playerBuildings.find(building => building.type === 'airstrip')
    ;['f22Raptor', 'f35'].forEach(type => {
      const jet = units.find(unit => unit.type === type)
      expect(jet.airstripId).toBe(airstrip.id)
      expect(jet.flightState).toBe('grounded')
      expect(jet.tileX).toBeGreaterThanOrEqual(airstrip.x)
      expect(jet.tileX).toBeLessThan(airstrip.x + airstrip.width)
      expect(jet.tileY).toBeGreaterThanOrEqual(airstrip.y)
      expect(jet.tileY).toBeLessThan(airstrip.y + airstrip.height)
    })
  })
})
