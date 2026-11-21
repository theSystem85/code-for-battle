import { afterEach, describe, expect, it, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { setupOreTooltip } from '../../src/input/oreTooltip.js'
import { getConnectedOreValue } from '../../src/game/oreValue.js'

const ore = oreDensity => ({ ore: true, oreDensity })
const seed = { seedCrystal: true, seedCrystalDensity: 4 }

describe('ore tooltip', () => {
  afterEach(() => {
    window.dispatchEvent(new Event('blur'))
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('[U07307] counts connected ore once at its remaining harvest value, excluding separate ore and seed value', () => {
    const grid = [
      [seed, ore(3), {}, ore(5)],
      [ore(1), seed, {}, ore(2)],
      [{}, {}, ore(5), {}]
    ]
    expect(getConnectedOreValue(grid, 0, 0)).toBe(7000)
    expect(getConnectedOreValue(grid, 1, 1)).toBe(7000)
  })

  it('[U07308] shows ore and seed values on hover and refreshes depleted tiles beneath a stationary pointer', () => {
    vi.useFakeTimers()
    const grid = [[seed, ore(3)]]
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, right: TILE_SIZE * 2, top: 0, bottom: TILE_SIZE })
    document.body.append(canvas)
    setupOreTooltip(canvas, grid)
    const tooltip = document.querySelector('[role="tooltip"]')
    const hover = clientX => canvas.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY: 5 }))

    hover(5)
    expect(tooltip.hidden).toBe(false)
    expect(tooltip.textContent).toContain('Seed crystal · Level 4')
    expect(tooltip.textContent).toContain('Connected ore: 6,000 credits')

    hover(TILE_SIZE + 5)
    expect(tooltip.textContent).toContain('Ore crystals · Level 3')
    expect(tooltip.textContent).toContain('Next harvest: 3,000 credits')
    expect(tooltip.textContent).toContain('Tile total: 6,000 credits')

    grid[0][1].ore = false
    vi.advanceTimersByTime(250)
    expect(tooltip.hidden).toBe(true)
  })
})
