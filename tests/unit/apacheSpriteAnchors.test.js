import { afterEach, expect, it, vi } from 'vitest'
import { getApacheRocketSpawnPoints, renderApacheWithImage } from '../../src/rendering/apacheImageRenderer.js'

vi.mock('../../src/logic.js', () => ({
  angleDiff: (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
}))

vi.mock('../../src/rendering/prepared/preparedSpritePipeline.js', () => ({
  getPreparedSprite: vi.fn(id => id.includes(':body:')
    ? { sourceWidth: 256, sourceHeight: 256 }
    : { sourceWidth: 256, sourceHeight: 256, logicalWidth: 48, logicalHeight: 48, anchors: { rotor: { x: 24, y: 24 } } }),
  drawPreparedSpriteCentered: vi.fn(),
  drawPreparedSpriteTopLeft: vi.fn()
}))

afterEach(() => vi.clearAllMocks())

it('[U07021] keeps regenerated Apache rocket hardpoints on the stub wings at every heading', () => {
  for (const direction of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const points = getApacheRocketSpawnPoints({ direction, altitude: 0 }, 100, 100)
    const forward = { x: Math.cos(direction), y: Math.sin(direction) }
    for (const point of Object.values(points)) {
      expect((point.x - 100) * forward.x + (point.y - 100) * forward.y).toBeCloseTo(42 * 33.6 / 256)
    }
    expect(Math.hypot(points.left.x - points.right.x, points.left.y - points.right.y)).toBeCloseTo(92 * 33.6 / 256)
  }
})

it('[U07022] moves rocket mounts and the rotor with the body during forward tilt and altitude lift', () => {
  const unit = { direction: Math.PI / 2, altitude: 20, speed: 1, movement: { currentSpeed: 1, velocity: { x: 0, y: 1 } } }
  const points = getApacheRocketSpawnPoints(unit, 100, 100)
  expect(points.left.y).toBeCloseTo(100 - 8 + (42 * 33.6 / 256 + 32 * 0.08) * 0.9)
  const ctx = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }), beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn()
  }
  expect(renderApacheWithImage(ctx, unit, 100, 100)).toBe(true)
  expect(ctx.translate).toHaveBeenCalledWith(100, 92)
  expect(ctx.translate).toHaveBeenCalledWith(0, 32 * 0.08 * 0.9)
  expect(ctx.rotate).toHaveBeenCalledWith(0)
})

it('[U07023] ships native-resolution recovery and Apache sources with density-correct rotor anchors', async() => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../../public/images/prepared/sprite-manifest.json'), 'utf8'))
  const entries = manifest.entries.filter(entry => entry.id === 'unit:recoveryTank:base' || entry.id.startsWith('aircraft:apache:'))
  expect(entries).toHaveLength(242)
  for (const entry of entries) {
    expect(entry.sourceWidth).toBe(256)
    expect(entry.sourceHeight).toBe(256)
    for (const variant of entry.variants) {
      expect(entry.sourceWidth).toBeGreaterThanOrEqual(variant.backingWidth)
      expect(entry.sourceHeight).toBeGreaterThanOrEqual(variant.backingHeight)
    }
  }
  expect(entries.find(entry => entry.id === 'aircraft:apache:rotor').anchors.rotor).toEqual({ x: 24, y: 24, sourceX: 128, sourceY: 128 })
})
