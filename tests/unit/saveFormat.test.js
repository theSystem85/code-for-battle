import { describe, expect, it } from 'vitest'
import { decodeSaveObject, encodeCompactSave } from '../../src/saveFormat.js'

describe('compact save format', () => {
  it('round trips map tiles and reconstructs redundant legacy indexes', () => {
    const mapTileState = [
      [{ type: 'land', ore: false }, { type: 'water', ore: true, oreDensity: 2 }],
      [{ type: 'land', ore: false }, { type: 'land', ore: false }]
    ]
    const legacy = {
      label: 'Round trip',
      time: 123,
      state: JSON.stringify({ gameState: { money: 42 }, mapTileState, mapGridTypes: [], orePositions: [] })
    }
    const compact = encodeCompactSave(legacy)
    const decoded = JSON.parse(decodeSaveObject(compact).state)

    expect(decoded.mapTileState).toEqual(mapTileState)
    expect(decoded.mapGridTypes).toEqual([['land', 'water'], ['land', 'land']])
    expect(decoded.orePositions).toEqual([{ x: 1, y: 0 }])
    expect(decoded.gameState.money).toBe(42)
  })

  it('reduces a uniform 200 by 200 map to less than one tenth of legacy JSON', () => {
    const tile = { type: 'land', ore: false, oreDensity: 0, seedCrystal: false, seedCrystalDensity: 0 }
    const mapTileState = Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => ({ ...tile })))
    const state = { mapTileState, mapGridTypes: mapTileState.map(row => row.map(entry => entry.type)), orePositions: [] }
    const legacy = { label: 'Large', time: 123, state: JSON.stringify(state) }

    expect(JSON.stringify(encodeCompactSave(legacy)).length).toBeLessThan(JSON.stringify(legacy).length / 10)
  })
})
