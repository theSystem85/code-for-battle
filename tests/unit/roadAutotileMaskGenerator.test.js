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

  test('generates a strict 1024x1024 sheet with 16 unique patterns and validation checks', () => {
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
    expect(result.tileMappings).toHaveLength(16)
    expect(result.validations.generatedCount).toBe(16)
    expect(result.validations.uniqueCount).toBe(16)
    expect(result.validations.hasExactCoverage).toBe(true)
    expect(result.validations.connectedCenterTouches).toBe(true)
    expect(result.validations.disconnectedCenterClear).toBe(true)
    expect(result.validations.dimensions.isExpectedSize).toBe(true)
  })

  test('renders deterministic tile pixels for same bitmask/config', () => {
    const tileA = generateRoadAutotileMaskTile(11, { tileSize: 64, roadWidth: 24, fadeDistance: 10 })
    const tileB = generateRoadAutotileMaskTile(11, { tileSize: 64, roadWidth: 24, fadeDistance: 10 })

    const dataA = tileA.getContext('2d').getImageData(0, 0, 64, 64).data
    const dataB = tileB.getContext('2d').getImageData(0, 0, 64, 64).data
    expect(Array.from(dataA)).toEqual(Array.from(dataB))
  })
})
