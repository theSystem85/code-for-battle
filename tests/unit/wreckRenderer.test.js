import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGameState,
  mockRenderTankWithImages,
  mockGetTankWreckCanvases,
  mockGetSingleImageWreckSprite
} = vi.hoisted(() => ({
  mockGameState: {
    shadowOfWarEnabled: false,
    humanPlayer: 'player',
    visibilityMap: []
  },
  mockRenderTankWithImages: vi.fn(() => true),
  mockGetTankWreckCanvases: vi.fn(() => ({ wagon: {}, turret: {}, barrel: {} })),
  mockGetSingleImageWreckSprite: vi.fn(() => ({ width: 64, height: 64 }))
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: mockGameState
}))

vi.mock('../../src/rendering/tankImageRenderer.js', () => ({
  renderTankWithImages: mockRenderTankWithImages
}))

vi.mock('../../src/rendering/wreckSpriteCache.js', () => ({
  getTankWreckCanvases: mockGetTankWreckCanvases,
  getSingleImageWreckSprite: mockGetSingleImageWreckSprite
}))

vi.mock('../../src/inputHandler.js', () => ({
  selectedUnits: []
}))

import { WreckRenderer } from '../../src/rendering/wreckRenderer.js'

function createMockContext() {
  return {
    rotateCalls: [],
    drawImageCalls: 0,
    save() {},
    restore() {},
    translate() {},
    rotate(angle) {
      this.rotateCalls.push(angle)
    },
    drawImage() {
      this.drawImageCalls += 1
    },
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillText() {},
    set font(_) {},
    set textAlign(_) {},
    set textBaseline(_) {},
    set lineWidth(_) {},
    set strokeStyle(_) {},
    set fillStyle(_) {},
    set globalAlpha(_) {},
    set filter(_) {}
  }
}

describe('WreckRenderer workshop restoration previews', () => {
  beforeEach(() => {
    mockRenderTankWithImages.mockClear()
    mockGetTankWreckCanvases.mockClear()
    mockGetSingleImageWreckSprite.mockClear()
  })

  it('uses the F22 wreck sprite and rotates restored wrecks by 45 degrees', () => {
    const renderer = new WreckRenderer()

    const f22Ctx = createMockContext()
    renderer.renderWreck(f22Ctx, {
      id: 'w1',
      x: 0,
      y: 0,
      unitType: 'f22Raptor',
      direction: 0,
      health: 100,
      maxHealth: 100,
      isBeingRestored: true
    }, { x: 0, y: 0 })

    const harvesterCtx = createMockContext()
    renderer.renderWreck(harvesterCtx, {
      id: 'w2',
      x: 32,
      y: 0,
      unitType: 'harvester',
      direction: 0,
      health: 100,
      maxHealth: 100,
      isBeingRestored: true
    }, { x: 0, y: 0 })

    expect(mockGetSingleImageWreckSprite).toHaveBeenCalledWith('f22Raptor')
    expect(f22Ctx.drawImageCalls).toBeGreaterThan(0)
    expect(f22Ctx.rotateCalls[0]).toBeCloseTo(Math.PI / 4)
    expect(harvesterCtx.rotateCalls[0]).toBeCloseTo(Math.PI / 4)
  })
})
