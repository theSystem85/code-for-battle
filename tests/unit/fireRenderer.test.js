import { describe, it, expect } from 'vitest'
import { FIRE_SHEET_PATH } from '../../src/rendering/fireSprites.js'
import { parseSpriteSheetMetadataFromFilename } from '../../src/rendering/spriteSheetAnimation.js'
import { getFireSeverity } from '../../src/game/fireSeverity.js'

describe('Fire atlas and severity', () => {
  it('[U07183] uses the explosion atlas filename contract', () => {
    expect(parseSpriteSheetMetadataFromFilename(FIRE_SHEET_PATH)).toMatchObject({ tileWidth: 64, tileHeight: 128, columns: 8, rows: 4, frameCount: 32 })
  })
  it('[U07184] bounds severity and grows only with simulation age', () => {
    expect([-10, 0, 20, 40, 60, 80, 10000].map(age => getFireSeverity({ age }))).toEqual([1, 1, 2, 3, 4, 5, 5])
  })
})

it('[U07185] renders shared edges only for visible neighbours and restores canvas state', async() => {
  const { vi } = await import('vitest')
  const ctx = {
    canvas: { width: 256, height: 256 }, save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), transform: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn()
  }
  const spriteModule = await import('../../src/rendering/fireSprites.js')
  vi.spyOn(spriteModule, 'getFireSprites').mockReturnValue({ width: 512, height: 512 })
  const { renderFires } = await import('../../src/rendering/fireRenderer.js')
  const { setFireDetail } = await import('../../src/config.js')
  setFireDetail('high')
  const fire = { x: 2, y: 2, age: 80, suppression: 0 }
  const neighbour = { x: 3, y: 2, age: 80, suppression: 0 }
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({})))
  grid[2][2].fire = fire
  grid[2][3].fire = neighbour
  const visibilityMap = []
  visibilityMap[2] = []
  visibilityMap[2][2] = { visible: true }
  const state = { fires: [fire, neighbour], shadowOfWarEnabled: true, visibilityMap }
  renderFires(ctx, state, grid, [], { x: 0, y: 0 })
  expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  visibilityMap[2][3] = { visible: true }
  ctx.drawImage.mockClear()
  renderFires(ctx, state, grid, [], { x: 0, y: 0 })
  expect(ctx.drawImage).toHaveBeenCalledTimes(6)
  expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length)
  vi.restoreAllMocks()
})
