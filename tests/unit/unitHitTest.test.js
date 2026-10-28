import { getBattleshipTurretLocalPoint } from '../../src/game/battleshipTurrets.js'
import { describe, expect, it } from 'vitest'
import { unitContainsPoint } from '../../src/input/unitHitTest.js'
import masks from '../../src/input/navalImageMasks.json'
import { TILE_SIZE } from '../../src/config.js'
import { getNavalRenderLengthTiles, hasNativeNavalSprite } from '../../src/utils/navalUtils.js'

describe('naval source alpha hit masks', () => {
  it.each(Object.keys(masks).filter(type => !['battleshipTurret', 'battleshipBarrel'].includes(type)))('[U07026] matches opaque and transparent asset pixels at arbitrary rotations for %s', type => {
    const mask = masks[type]
    const scale = hasNativeNavalSprite(type) ? 1 / 3 : TILE_SIZE * getNavalRenderLengthTiles(type) / Math.max(mask.width, mask.height)
    for (const direction of [0, Math.PI / 2, 0.731, -1.2]) {
      const unit = { type, isNaval: true, health: 100, x: 120, y: 240, direction }
      const angle = direction - Math.PI / 2
      for (let y = 0; y < mask.height; y += 7) {
        for (let x = 0; x < mask.width; x += 7) {
          const localX = (x + 0.5 - mask.width / 2) * scale
          const localY = (y + 0.5 - mask.height / 2) * scale
          const row = mask.rows[y]
          const opaque = row.some((start, i) => i % 2 === 0 && x >= start && x < row[i + 1])
          expect(unitContainsPoint(unit,
            unit.x + TILE_SIZE / 2 + localX * Math.cos(angle) - localY * Math.sin(angle),
            unit.y + TILE_SIZE / 2 + localX * Math.sin(angle) + localY * Math.cos(angle))).toBe(opaque)
        }
      }
      expect(unitContainsPoint(unit, unit.x + 200, unit.y + 200)).toBe(false)
    }
  })
  it('[U07027] ignores embarked and dead units and respects submarine reveal clipping', () => {
    const unit = { type: 'submarine', x: 0, y: 0, health: 100, direction: Math.PI / 2, depthState: 'surfacing', depthTransitionProgress: 0.1 }
    expect(unitContainsPoint(unit, TILE_SIZE / 2, TILE_SIZE / 2)).toBe(false)
    expect(unitContainsPoint({ ...unit, health: 0 }, 16, 16)).toBe(false)
    expect(unitContainsPoint({ ...unit, embarkedOnId: 'carrier' }, 16, 16)).toBe(false)
  })
  it('[U07032] includes independently rotated battleship barrels beyond the opaque hull', () => {
    const unit = { type: 'battleship', isNaval: true, health: 100, x: 0, y: 0, direction: 0 }
    const x = TILE_SIZE / 2 + getBattleshipTurretLocalPoint('foreOuter').y + 1.31
    const y = TILE_SIZE / 2 + 19
    expect(unitContainsPoint(unit, x, y)).toBe(false)
    unit.batteries = { foreOuter: { direction: Math.PI / 2 } }
    expect(unitContainsPoint(unit, x, y)).toBe(true)
  })

})
