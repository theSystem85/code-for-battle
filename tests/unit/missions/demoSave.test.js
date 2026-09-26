import { describe, expect, it } from 'vitest'

import { UNIT_PROPERTIES } from '../../../src/config.js'
import { demoSave } from '../../../src/missions/mission_demo.js'
import { getBuiltinMissionById } from '../../../src/missions/index.js'
import { missionText } from '../../../src/missions/missionText.js'

const AIR = new Set(['apache', 'f22Raptor', 'f35'])

describe('demo builtin save', () => {
  const state = JSON.parse(demoSave.state)

  it('is a locked builtin save with localized labels and no intro clip', () => {
    expect(getBuiltinMissionById('demo')).toBe(demoSave)
    expect(demoSave.id).toBe('demo')
    expect(demoSave.introVideo).toBeUndefined()
    expect(demoSave.label).toBe(missionText('missions.demo.label', 'en'))
    expect(missionText('missions.demo.label', 'de')).toBe('Demo')
    expect(missionText('missions.demo.description', 'de').length).toBeGreaterThan(20)
    expect(demoSave.time).toBeLessThan(getBuiltinMissionById('Mission_01').time)
    expect(demoSave.focus.tileX).toBeGreaterThan(0)
    expect(demoSave.focus.tileY).toBeGreaterThan(0)
  })

  it('stores the generated terrain, including water, rock, and several biomes', () => {
    const tiles = state.mapTileState.flat()
    const types = new Set(tiles.map(tile => tile.type))
    const biomes = new Set(tiles.map(tile => tile.biome).filter(Boolean))
    expect(state.gameState.mapTilesX).toBe(state.mapTileState[0].length)
    expect(state.gameState.mapTilesY).toBe(state.mapTileState.length)
    expect(state.gameState.activeSpriteSheetBiomeTag).toBe('mixed')
    expect(types.has('land')).toBe(true)
    expect(types.has('water')).toBe(true)
    expect(types.has('rock')).toBe(true)
    expect(biomes.size).toBeGreaterThanOrEqual(3)
    expect(state.mapGridTypes.length).toBe(state.mapTileState.length)
  })

  it('fields land, air, and naval units for both sides around finished bases', () => {
    const owners = ['player1', 'player2']
    owners.forEach(owner => {
      const units = state.units.filter(unit => unit.owner === owner)
      const buildings = state.buildings.filter(building => building.owner === owner)
      const kinds = new Set(units.map(unit => {
        if (AIR.has(unit.type)) return 'air'
        if (UNIT_PROPERTIES[unit.type]?.isNaval) return 'naval'
        return 'land'
      }))
      expect(kinds).toEqual(new Set(['land', 'air', 'naval']))
      expect(buildings.some(building => building.type === 'constructionYard' && building.id === owner)).toBe(true)
      expect(buildings.some(building => building.type === 'shipyard')).toBe(true)
      units.filter(unit => AIR.has(unit.type)).forEach(unit => {
        expect(unit.flightState).toBe('airborne')
        expect(unit.altitude).toBeGreaterThan(0)
      })
    })

    const focus = demoSave.focus
    let water = 0
    let rock = 0
    let street = 0
    const landBiomes = new Set()
    for (let y = focus.tileY - 6; y <= focus.tileY + 6; y++) {
      for (let x = focus.tileX - 12; x <= focus.tileX + 12; x++) {
        const tile = state.mapTileState[y]?.[x]
        if (!tile) continue
        if (tile.type === 'water') water += 1
        else if (tile.type === 'rock') rock += 1
        else if (tile.type === 'street') street += 1
        else if (tile.biome) landBiomes.add(tile.biome)
      }
    }
    expect(water).toBeGreaterThan(40)
    expect(rock).toBeGreaterThan(20)
    expect(street).toBe(0)
    expect(landBiomes.has('grass')).toBe(true)
    expect(landBiomes.has('sand')).toBe(true)

    const naval = state.units.filter(unit => UNIT_PROPERTIES[unit.type]?.isNaval)
    expect(naval.length).toBeGreaterThanOrEqual(4)
    naval.forEach(unit => {
      expect(state.mapGridTypes[unit.tileY][unit.tileX]).toBe('water')
    })

    const yard = state.buildings.find(building => building.id === 'player1')
    expect(yard.isHuman).toBe(true)
    expect(state.gameState.humanPlayer).toBe('player1')
    expect(state.aiFactoryBudgets.player2).toBeGreaterThan(0)
    state.units.forEach(unit => {
      expect(unit.tileX).toBe(Math.floor((unit.x + 16) / 32))
      expect(unit.tileY).toBe(Math.floor((unit.y + 16) / 32))
    })
  })
})
