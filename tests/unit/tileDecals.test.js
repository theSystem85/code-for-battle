import { describe, it, expect } from 'vitest'
import { setTileDecal, setWorldDecal, setBuildingDebrisDecals } from '../../src/game/tileDecals.js'

describe('tileDecals', () => {
  it('sets a deterministic decal variant from map seed and tile coordinate', () => {
    const mapGridA = [[{ type: 'land' }]]
    const mapGridB = [[{ type: 'land' }]]
    const gameState = { mapSeed: 'abc-seed' }

    const decalA = setTileDecal(mapGridA, gameState, 0, 0, 'impact')
    const decalB = setTileDecal(mapGridB, gameState, 0, 0, 'impact')

    expect(decalA).toEqual(decalB)
    expect(mapGridA[0][0].decalCounter).toBe(1)
  })

  it('replaces an existing tile decal when a new event occurs', () => {
    const mapGrid = [[{ type: 'land' }]]
    const gameState = { mapSeed: '42' }

    const firstDecal = setTileDecal(mapGrid, gameState, 0, 0, 'impact')
    const secondDecal = setTileDecal(mapGrid, gameState, 0, 0, 'crater')

    expect(firstDecal.tag).toBe('impact')
    expect(secondDecal.tag).toBe('crater')
    expect(mapGrid[0][0].decal.tag).toBe('crater')
    expect(mapGrid[0][0].decalCounter).toBe(2)
  })

  it('preserves an existing crater when a later impact hits the same tile', () => {
    const mapGrid = [[{ type: 'land' }]]
    const gameState = { mapSeed: '42' }

    const crater = setTileDecal(mapGrid, gameState, 0, 0, 'crater')
    const afterImpact = setTileDecal(mapGrid, gameState, 0, 0, 'impact')

    expect(afterImpact).toBe(crater)
    expect(mapGrid[0][0].decal.tag).toBe('crater')
    expect(mapGrid[0][0].decalCounter).toBe(1)
  })

  it('applies debris decals to every tile of a building footprint', () => {
    const mapGrid = [
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]
    const gameState = { mapSeed: '9' }

    setBuildingDebrisDecals(mapGrid, gameState, { x: 1, y: 0, width: 2, height: 2 })

    expect(mapGrid[0][1].decal?.tag).toBe('debris')
    expect(mapGrid[0][2].decal?.tag).toBe('debris')
    expect(mapGrid[1][1].decal?.tag).toBe('debris')
    expect(mapGrid[1][2].decal?.tag).toBe('debris')
    expect(mapGrid[1][2].decal?.footprintWidth).toBe(2)
    expect(mapGrid[1][2].decal?.footprintHeight).toBe(2)
    expect(mapGrid[1][2].decal?.originX).toBe(1)
    expect(mapGrid[1][2].decal?.originY).toBe(0)
    expect(mapGrid[0][0].decal).toBeUndefined()
  })

  it('supports world-coordinate impact placement', () => {
    const mapGrid = [
      [{ type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }]
    ]
    const gameState = { mapSeed: '17' }

    setWorldDecal(mapGrid, gameState, 20, 20, 'impact')
    expect(mapGrid[0][0].decal?.tag).toBe('impact')
  })

  it('does not place impact or crater decals on water tiles', () => {
    const mapGrid = [[{ type: 'water' }]]
    const gameState = { mapSeed: '17' }

    const impactDecal = setTileDecal(mapGrid, gameState, 0, 0, 'impact')
    const craterDecal = setTileDecal(mapGrid, gameState, 0, 0, 'crater')

    expect(impactDecal).toBeNull()
    expect(craterDecal).toBeNull()
    expect(mapGrid[0][0].decal).toBeUndefined()
    expect(mapGrid[0][0].decalCounter).toBeUndefined()
  })

  it('still allows debris decals on water tiles', () => {
    const mapGrid = [[{ type: 'water' }]]
    const gameState = { mapSeed: '17' }

    const debrisDecal = setTileDecal(mapGrid, gameState, 0, 0, 'debris')

    expect(debrisDecal?.tag).toBe('debris')
    expect(mapGrid[0][0].decal?.tag).toBe('debris')
    expect(mapGrid[0][0].decalCounter).toBe(1)
  })
})
