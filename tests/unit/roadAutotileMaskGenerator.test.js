import { describe, expect, test } from 'vitest'
import {
  bitmaskToConnectivity,
  connectivityToDebugLabel,
  generateRoadAutotileMaskSheet,
  generateRoadAutotileMaskTile,
  ROAD_BIT_ORDER_LABEL
} from '../../src/ui/roadAutotileMaskGenerator.js'

describe('roadAutotileMaskGenerator', () => {
  test('uses deterministic bit ordering and labels', () => {
    const connectivity = bitmaskToConnectivity(5)
    expect(connectivity).toEqual({ top: true, right: false, bottom: true, left: false })
    expect(connectivityToDebugLabel(connectivity)).toBe('T1 R0 B1 L0')
    expect(ROAD_BIT_ORDER_LABEL).toContain('top=1')
  })

  test('generates strict base coverage and grouped rotation columns', () => {
    const result = generateRoadAutotileMaskSheet({
      tileSize: 64,
      columns: 16,
      rows: 16,
      roadWidth: 26,
      fadeDistance: 12,
      cornerRadius: 0
    })

    expect(result.canvas.width).toBe(1024)
    expect(result.canvas.height).toBe(1024)
    expect(result.validations.generatedCount).toBe(16)
    expect(result.validations.uniqueCount).toBe(16)
    expect(result.validations.hasExactCoverage).toBe(true)
    expect(result.validations.connectedCenterTouches).toBe(true)
    expect(result.validations.disconnectedCenterClear).toBe(true)
    expect(result.validations.dimensions.isExpectedSize).toBe(true)

    const tJunctionColumn = result.tileMappings.filter(tile => tile.columnKey === 't_junction')
    expect(tJunctionColumn).toHaveLength(4)
    expect(new Set(tJunctionColumn.map(tile => tile.col)).size).toBe(1)

    const straightColumn = result.tileMappings.filter(tile => tile.columnKey === 'straight')
    expect(straightColumn).toHaveLength(2)

    const crossColumn = result.tileMappings.filter(tile => tile.columnKey === 'cross')
    expect(crossColumn).toHaveLength(1)

    const fullFillTile = result.tileMappings.find(tile => tile.kind === 'full-fill')
    expect(fullFillTile).toBeTruthy()

    const wideEdgeFadeTiles = result.tileMappings.filter(tile => tile.kind === 'wide-edge-fade')
    expect(wideEdgeFadeTiles).toHaveLength(4)
    expect(new Set(wideEdgeFadeTiles.map(tile => tile.fadeEdge)).size).toBe(4)
  })

  test('renders deterministic tile pixels for same bitmask/config', () => {
    const tileA = generateRoadAutotileMaskTile(11, { tileSize: 64, roadWidth: 24, fadeDistance: 10 })
    const tileB = generateRoadAutotileMaskTile(11, { tileSize: 64, roadWidth: 24, fadeDistance: 10 })

    const dataA = tileA.getContext('2d').getImageData(0, 0, 64, 64).data
    const dataB = tileB.getContext('2d').getImageData(0, 0, 64, 64).data
    expect(Array.from(dataA)).toEqual(Array.from(dataB))
  })
})
