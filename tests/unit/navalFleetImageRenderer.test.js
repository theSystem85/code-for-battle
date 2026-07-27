import { describe, expect, it } from 'vitest'

import {
  BATTLESHIP_TURRET_RENDER_ORDER,
  BATTLESHIP_TURRET_RENDER_SCALE
} from '../../src/rendering/navalFleetImageRenderer.js'

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
})
