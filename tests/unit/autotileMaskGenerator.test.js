import { describe, expect, it } from 'vitest'
import '../setup.js'
import {
  bitmaskToConnectivity,
  connectivityToDebugLabel,
  generateRoadAutotileMaskSheet,
  generateRoadAutotileMaskTile,
  validateRoadAutotileMaskSheet
} from '../../src/ui/autotileMaskGenerator.js'

describe('autotileMaskGenerator', () => {
  it('maps bitmasks to deterministic 4-bit connectivity labels', () => {
    expect(bitmaskToConnectivity(0)).toEqual({ top: false, right: false, bottom: false, left: false })
    expect(bitmaskToConnectivity(5)).toEqual({ top: true, right: false, bottom: true, left: false })
    expect(connectivityToDebugLabel(bitmaskToConnectivity(10))).toBe('T0 R1 B0 L1')
  })

  it('creates connected edges that touch border center and disconnected edges that do not', () => {
    const connectedTop = generateRoadAutotileMaskTile(1)
    const disconnectedTop = generateRoadAutotileMaskTile(0)
    const center = Math.floor(connectedTop.width / 2)

    const read = (tile, x, y) => tile.pixels[((y * tile.width) + x) * 4]
    expect(read(connectedTop, center, 0)).toBeGreaterThanOrEqual(250)
    expect(read(disconnectedTop, center, 0)).toBe(0)
  })

  it('generates a strict 1024x1024 sheet with exactly 16 unique patterns', () => {
    const result = generateRoadAutotileMaskSheet({
      tileSize: 32,
      columns: 8,
      rows: 8
    })

    expect(result.config.tileSize).toBe(64)
    expect(result.config.columns).toBe(16)
    expect(result.config.rows).toBe(16)
    expect(result.canvas.width).toBe(1024)
    expect(result.canvas.height).toBe(1024)
    expect(result.tileMap).toHaveLength(16)
    expect(new Set(result.tileMap.map(entry => entry.bitmask)).size).toBe(16)
    expect(result.validation.valid).toBe(true)
  })

  it('detects validation errors when a non-connected edge reaches border center', () => {
    const result = generateRoadAutotileMaskSheet()
    const entry = result.tileMap.find(tile => tile.bitmask === 0)
    const center = Math.floor(entry.tile.width / 2)
    const idx = ((0 * entry.tile.width) + center) * 4
    entry.tile.pixels[idx] = 255

    const validation = validateRoadAutotileMaskSheet(result)
    expect(validation.valid).toBe(false)
    expect(validation.errors.join(' ')).toMatch(/non-connected top edge reaches border center/)
  })
})
