import { describe, it, expect, vi } from 'vitest'
import { normalizeSpriteSheetZoomFactor, zoomDecorationGroup } from '../../src/rendering/spriteSheetZoom.js'
import { TextureManager } from '../../src/rendering/textureManager.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { computeMapTopologyFingerprint } from '../../src/game/mapTopology.js'

function group(width, height) {
  const image = {}, tags = ['grass', 'decorative', 'city', 'impassable', 'group_1']
  return { width, height, groupLabel: 'group_1', tagSet: new Set(tags), tilesByOffset: Object.fromEntries(
    Array.from({ length: width * height }, (_, i) => [`${i % width},${Math.floor(i / width)}`, {
      image, tags, sheetPath: 'zoom.webp', col: i % width, row: Math.floor(i / width), blendMode: 'alpha',
      rect: { x: 128 + i % width * 64, y: 64 + Math.floor(i / width) * 64, width: 64, height: 64 }
    }])) }
}

describe('sheet zoom preparation', () => {
  it.each([[1, 1, 2, 2, 2], [2, 2, 2, 4, 4], [3, 2, 1.25, 4, 3], [3, 2, 0.4, 2, 1]])('[U05442] rounds footprints up and preserves the exact artwork scale for %sx%s at %s', (w, h, zoom, expectedWidth, expectedHeight) => {
    const original = group(w, h), prepared = zoomDecorationGroup(original, zoom)
    expect([prepared.width, prepared.height]).toEqual([expectedWidth, expectedHeight])
    expect(Object.keys(prepared.tilesByOffset)).toHaveLength(expectedWidth * expectedHeight)
    expect(prepared.sourceTilesByOffset).toBe(original.tilesByOffset)
    let totalArea = 0
    for (const tile of Object.values(prepared.tilesByOffset)) {
      const d = tile.destinationRect
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.y).toBeGreaterThanOrEqual(0)
      expect(d.x + d.width).toBeLessThanOrEqual(32 + 1e-9)
      expect(d.y + d.height).toBeLessThanOrEqual(32 + 1e-9)
      expect(d.width / tile.rect.width).toBeCloseTo(zoom / 2)
      expect(d.height / tile.rect.height).toBeCloseTo(zoom / 2)
      totalArea += d.width * d.height
    }
    expect(totalArea).toBeCloseTo(w * h * zoom ** 2 * 32 ** 2)
    expect(original.width).toBe(w)
    expect(Object.values(prepared.tilesByOffset).every(tile => tile.image === original.tilesByOffset['0,0'].image)).toBe(true)
  })

  it('[U05443] defaults to one, preserves identity and bounds configuration memory', () => {
    const original = group(2, 1)
    for (const value of [undefined, null, 0, -1, NaN, Infinity, '2']) expect(normalizeSpriteSheetZoomFactor(value)).toBe(1)
    expect(zoomDecorationGroup(original)).toBe(original)
    expect(() => zoomDecorationGroup(original, 1000)).toThrow(/budget/)
  })

  it('[U05444] changes topology for zoom edits while keeping omitted and explicit one equivalent', () => {
    const fingerprint = zoomFactor => computeMapTopologyFingerprint({ enabled: true, sheets: [{ sheetPath: 'a.webp', metadata: { zoomFactor } }] })
    expect(fingerprint(undefined)).toBe(fingerprint(1))
    expect(fingerprint(1.25)).not.toBe(fingerprint(1))
    expect(fingerprint(2)).not.toBe(fingerprint(1.25))
  })

  it('[U05445] carries fractional sampling bounds through the manager to actual rendering and whole building occupancy', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ width: 256, height: 256 })
    const source = group(1, 1)
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{ sheetPath: 'zoom.webp', metadata: {
      zoomFactor: 1.25, blendMode: 'alpha', tiles: { '0,0': source.tilesByOffset['0,0'] }
    } }] })
    const map = Array.from({ length: 80 }, () => Array.from({ length: 80 }, () => ({ type: 'land', biome: 'grass' })))
    const layout = manager.getDecorationLayout(map)
    const cell = layout.cells.find(Boolean)
    expect(cell).toBeTruthy()
    expect([cell.group.width, cell.group.height]).toEqual([2, 2])
    const tile = manager.getIntegratedTileForMapTile('land', cell.anchorX, cell.anchorY, { mapGrid: map })
    expect(tile.destinationRect).toEqual({ x: 12, y: 12, width: 20, height: 20 })
    const ctx = { drawImage: vi.fn() }
    MapRenderer.prototype.drawIntegratedTileImage.call({}, ctx, tile, 100, 200)
    expect(ctx.drawImage.mock.calls[0].slice(5)).toEqual([112, 212, 20, 20])
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const covered = layout.cells[(cell.anchorY + y) * 80 + cell.anchorX + x]
      expect(covered.group).toBe(cell.group)
      expect(covered.cityBuilding).toBe(cell.cityBuilding)
    }
    expect(cell.cityBuilding.width).toBe(2)
    expect(cell.cityBuilding.height).toBe(2)
  })
})
