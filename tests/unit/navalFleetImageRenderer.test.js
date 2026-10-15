import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BATTLESHIP_TURRET_RENDER_ORDER,
  BATTLESHIP_TURRET_RENDER_SCALE,
  preloadNavalFleetImage,
  renderNavalFleetUnit
} from '../../src/rendering/navalFleetImageRenderer.js'

const originalImage = globalThis.Image

afterEach(() => {
  globalThis.Image = originalImage
})

describe('battleship layered turret rendering', () => {
  it('renders complete turret assemblies 30% smaller', () => {
    expect(BATTLESHIP_TURRET_RENDER_SCALE).toBe(0.7)
  })

  it('renders inner turrets after their outer turret so they appear mounted higher', () => {
    expect(BATTLESHIP_TURRET_RENDER_ORDER.indexOf('foreInner'))
      .toBeGreaterThan(BATTLESHIP_TURRET_RENDER_ORDER.indexOf('foreOuter'))
    expect(BATTLESHIP_TURRET_RENDER_ORDER.indexOf('aftInner'))
      .toBeGreaterThan(BATTLESHIP_TURRET_RENDER_ORDER.indexOf('aftOuter'))
  })

  it('does not render per-turret firing arcs for a selected battleship hull', () => {
    globalThis.Image = class {
      constructor() {
        this.complete = true
        this.width = 128
        this.height = 128
        this.naturalWidth = 128
        this.naturalHeight = 128
      }

      set src(_value) {
        this.onload?.()
      }
    }
    preloadNavalFleetImage('battleship')

    const ctx = {
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn()
    }
    const turret = {
      direction: 0,
      enabled: true,
      barrelRecoilStartTimes: [null, null],
      muzzleFlashStartTimes: [null, null]
    }
    const battleship = {
      type: 'battleship',
      direction: 0,
      selected: true,
      selectedTurret: null,
      batteries: {
        foreOuter: { ...turret },
        foreInner: { ...turret },
        aftInner: { ...turret },
        aftOuter: { ...turret }
      }
    }

    expect(renderNavalFleetUnit(ctx, battleship, 100, 100, 'player1')).toBe(true)
    expect(ctx.drawImage).toHaveBeenCalledTimes(13)
    expect(ctx.setLineDash).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
  })
})
