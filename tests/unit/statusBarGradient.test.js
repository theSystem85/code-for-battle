import { describe, expect, it } from 'vitest'
import {
  STATUS_BAR_ARC_SEGMENTS,
  STATUS_BAR_LEADING_WHITE_MIX,
  colorToCss,
  fillStatusBar,
  getStatusBarFillSprite,
  linearFillGradientCss,
  mixTowardWhite,
  parseCssColor,
  resetStatusBarGradientCacheForTests,
  sampleStatusBarFill,
  strokeStatusArc
} from '../../src/utils/statusBarGradient.js'

describe('status bar gradient', () => {
  it('reuses the energy bar linear-gradient stop structure', () => {
    expect(linearFillGradientCss('#3f8f44', '#7ce284', 90)).toBe(
      'linear-gradient(90deg, #3f8f44 0%, #7ce284 100%)'
    )
    expect(linearFillGradientCss('#c9352b', '#ff8a80')).toBe(
      'linear-gradient(90deg, #c9352b 0%, #ff8a80 100%)'
    )
  })

  it('mixes a base color toward white only at the leading edge', () => {
    expect(STATUS_BAR_LEADING_WHITE_MIX).toBeGreaterThanOrEqual(0.2)
    expect(STATUS_BAR_LEADING_WHITE_MIX).toBeLessThanOrEqual(0.3)

    const base = sampleStatusBarFill('#ff0000', 0)
    const tip = sampleStatusBarFill('#ff0000', 1)
    expect(base).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(tip).toEqual({ r: 255, g: 64, b: 64, a: 1 })

    const green = sampleStatusBarFill('#0f0', 1)
    const greenLong = sampleStatusBarFill('#00ff00', 1)
    expect(green).toEqual(greenLong)
    expect(green).toEqual({ r: 64, g: 255, b: 64, a: 1 })

    const mid = sampleStatusBarFill('#4A90E2', 0.5)
    const full = sampleStatusBarFill('#4A90E2', 1)
    expect(mid.r).toBeGreaterThan(74)
    expect(mid.r).toBeLessThan(full.r)
    expect(full.b).toBeGreaterThan(226)
  })

  it('parses short hex and rgba colors', () => {
    expect(parseCssColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseCssColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(colorToCss(mixTowardWhite({ r: 0, g: 0, b: 0, a: 0.5 }, 0))).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('draws the filled rect once and does not build a gradient on the destination context', () => {
    resetStatusBarGradientCacheForTests()
    const draws = []
    const ctx = {
      fillStyle: '',
      createLinearGradient() {
        throw new Error('destination context should not allocate a gradient')
      },
      fillRect(...args) {
        draws.push(['fill', ...args, this.fillStyle])
      },
      drawImage(...args) {
        draws.push(['image', ...args])
      }
    }

    fillStatusBar(ctx, 4, 8, 20, 4, '#ff0000', 'horizontal')
    fillStatusBar(ctx, 4, 8, 0, 4, '#ff0000', 'horizontal')
    fillStatusBar(ctx, 1, 2, 3, 10, '#4A90E2', 'vertical')

    const sprite = getStatusBarFillSprite('#ff0000', 'horizontal')
    const otherCase = getStatusBarFillSprite('#FF0000', 'horizontal')
    expect(getStatusBarFillSprite('#ff0000', 'horizontal')).toBe(sprite)
    if (sprite) {
      expect(otherCase).not.toBe(sprite)
      expect(getStatusBarFillSprite('#ff0000', 'vertical')).not.toBe(sprite)
    } else {
      expect(otherCase).toBeNull()
    }

    if (sprite) {
      expect(draws).toEqual([
        ['image', sprite, 4, 8, 20, 4],
        ['image', getStatusBarFillSprite('#4A90E2', 'vertical'), 1, 2, 3, 10]
      ])
      expect(ctx.fillStyle).toBe('')
    } else {
      expect(draws).toEqual([
        ['fill', 4, 8, 20, 4, '#ff0000'],
        ['fill', 1, 2, 3, 10, '#4A90E2']
      ])
    }
  })

  it('strokes a donut arc from the base color toward white without a canvas gradient', () => {
    const styles = []
    const ctx = {
      lineWidth: 4,
      lineCap: 'round',
      strokeStyle: '',
      beginPath() {},
      arc() {},
      stroke() {
        styles.push(this.strokeStyle)
      },
      createLinearGradient() {
        throw new Error('arc path should use cached colors')
      }
    }

    strokeStatusArc(ctx, 10, 10, 18, 0, Math.PI / 2, '#ff0000')
    expect(styles).toHaveLength(STATUS_BAR_ARC_SEGMENTS)
    expect(ctx.lineCap).toBe('round')

    const first = parseCssColor(styles[0])
    const last = parseCssColor(styles[styles.length - 1])
    expect(first.g).toBeLessThan(last.g)
    expect(last.g).toBeLessThanOrEqual(64)
    expect(first.r).toBe(255)
    expect(last.r).toBe(255)

    const again = []
    ctx.stroke = function record() {
      again.push(this.strokeStyle)
    }
    strokeStatusArc(ctx, 0, 0, 12, 1, 2, '#ff0000')
    expect(again).toEqual(styles)
  })
})
