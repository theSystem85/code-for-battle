import { describe, it, expect } from 'vitest'
import { setTileDecal, setWorldDecal, setBuildingDebrisDecals, isDecalBlockedTile, setDecalSurfaceBlocker } from '../../src/game/tileDecals.js'

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
    expect(mapGrid[0][1].decal?.groupWidth).toBe(2)
    expect(mapGrid[0][1].decal?.groupHeight).toBe(2)
    expect(mapGrid[1][2].decal?.groupOriginX).toBe(1)
    expect(mapGrid[1][2].decal?.groupOriginY).toBe(0)
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

  it('only places impact and crater decals on passable tiles', () => {
    const mapGrid = [[{ type: 'rock' }, { type: 'land', building: { type: 'powerPlant' } }, { type: 'land', seedCrystal: true }, { type: 'land' }, { type: 'land', building: { type: 'airstrip' }, buildOnlyOccupied: true }]]
    const gameState = { mapSeed: '9' }
    for (const x of [0, 1, 2]) {
      expect(setTileDecal(mapGrid, gameState, x, 0, 'impact')).toBeNull()
      expect(setTileDecal(mapGrid, gameState, x, 0, 'crater')).toBeNull()
      expect(mapGrid[0][x].decal).toBeUndefined()
    }
    expect(setTileDecal(mapGrid, gameState, 3, 0, 'crater')?.tag).toBe('crater')
    // Build-only airstrip tiles stay drivable, so they keep their marks.
    expect(setTileDecal(mapGrid, gameState, 4, 0, 'impact')?.tag).toBe('impact')
    // Debris is the rubble of a destroyed structure and may sit on its footprint.
    expect(setTileDecal(mapGrid, gameState, 1, 0, 'debris')?.tag).toBe('debris')
  })

  it('consults registered surface blockers for impassable decorations', () => {
    const mapGrid = [[{ type: 'land' }, { type: 'land' }]]
    setDecalSurfaceBlocker('test', (_grid, x) => x === 1)
    try {
      expect(isDecalBlockedTile(mapGrid, 1, 0, 'impact')).toBe(true)
      expect(isDecalBlockedTile(mapGrid, 0, 0, 'impact')).toBe(false)
      expect(isDecalBlockedTile(mapGrid, 1, 0, 'debris')).toBe(false)
      expect(setWorldDecal(mapGrid, { mapSeed: '1' }, 48, 16, 'crater')).toBeNull()
    } finally {
      setDecalSurfaceBlocker('test', null)
    }
    expect(isDecalBlockedTile(mapGrid, 1, 0, 'impact')).toBe(false)
  })
})
