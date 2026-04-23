import { describe, expect, it } from 'vitest'
import {
  bitmaskToConnectivity,
  connectivityToDebugLabel,
  generateRoadAutotileMaskSheet,
  generateRoadAutotileMaskTile
} from '../../src/tools/autotileMaskGenerator.js'

describe('autotileMaskGenerator', () => {
  it('uses TRBL bit ordering deterministically', () => {
    expect(bitmaskToConnectivity(0)).toEqual({ top: false, right: false, bottom: false, left: false })
    expect(bitmaskToConnectivity(1)).toEqual({ top: true, right: false, bottom: false, left: false })
    expect(bitmaskToConnectivity(2)).toEqual({ top: false, right: true, bottom: false, left: false })
    expect(bitmaskToConnectivity(4)).toEqual({ top: false, right: false, bottom: true, left: false })
    expect(bitmaskToConnectivity(8)).toEqual({ top: false, right: false, bottom: false, left: true })
  })

  it('formats connectivity labels for debug overlays', () => {
    expect(connectivityToDebugLabel({ top: true, right: false, bottom: true, left: false })).toBe('T1 R0 B1 L0')
  })

  it('generates a valid 1024x1024 sheet with exactly 16 unique patterns', () => {
    const sheet = generateRoadAutotileMaskSheet()
    expect(sheet.width).toBe(1024)
    expect(sheet.height).toBe(1024)
    expect(sheet.tiles).toHaveLength(16)
    expect(sheet.validation.valid).toBe(true)
    expect(sheet.validation.uniquePatternCount).toBe(16)
  })

  it('keeps all non-required tiles black', () => {
    const sheet = generateRoadAutotileMaskSheet()
    const tileSize = sheet.config.tileSize
    const startX = 0
    const startY = tileSize
    let hasNonBlack = false

    for (let y = startY; y < sheet.height; y++) {
      for (let x = startX; x < sheet.width; x++) {
        const value = sheet.pixels[(y * sheet.width) + x]
        if (value !== 0) {
          hasNonBlack = true
          break
        }
      }
      if (hasNonBlack) break
    }

    expect(hasNonBlack).toBe(false)
  })

  it('connected edges hit border center and disconnected edges do not', () => {
    const tile = generateRoadAutotileMaskTile(5) // top + bottom
    const center = Math.floor(tile.tileSize / 2)
    const sample = (x, y) => tile.pixels[(y * tile.tileSize) + x]

    expect(sample(center, 0)).toBeGreaterThan(0)
    expect(sample(center, tile.tileSize - 1)).toBeGreaterThan(0)
    expect(sample(0, center)).toBe(0)
    expect(sample(tile.tileSize - 1, center)).toBe(0)
  })
})
