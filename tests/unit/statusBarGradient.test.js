import { describe, expect, it } from 'vitest'
import {
  STATUS_BAR_ARC_SEGMENTS,
  STATUS_BAR_LEADING_WHITE_MIX,
  STATUS_BAR_RAIL_EDGE,
  STATUS_BAR_START_BLACK_MIX,
  colorToCss,
  drawStatusBar,
  fillStatusBar,
  getStatusBarFillSprite,
  linearFillGradientCss,
  mixTowardBlack,
  mixTowardWhite,
  parseCssColor,
  resetStatusBarGradientCacheForTests,
  sampleStatusBarFill,
  sampleStatusBarGloss,
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

  it('darkens the fill start and mixes 40% white at the growing edge', () => {
    expect(STATUS_BAR_START_BLACK_MIX).toBeGreaterThanOrEqual(0.2)
    expect(STATUS_BAR_START_BLACK_MIX).toBeLessThanOrEqual(0.25)
    expect(STATUS_BAR_LEADING_WHITE_MIX).toBe(0.4)

    const base = sampleStatusBarFill('#ff0000', 0)
    const tip = sampleStatusBarFill('#ff0000', 1)
    expect(base).toEqual(mixTowardBlack({ r: 255, g: 0, b: 0, a: 1 }, STATUS_BAR_START_BLACK_MIX))
    expect(base.r).toBeLessThan(255)
    expect(base.g).toBe(0)
    expect(tip).toEqual(mixTowardWhite({ r: 255, g: 0, b: 0, a: 1 }, 0.4))
    expect(tip).toEqual({ r: 255, g: 102, b: 102, a: 1 })

    const green = sampleStatusBarFill('#0f0', 1)
    const greenLong = sampleStatusBarFill('#00ff00', 1)
    expect(green).toEqual(greenLong)
    expect(green).toEqual({ r: 102, g: 255, b: 102, a: 1 })
    expect(sampleStatusBarFill('#00ff00', 0).g).toBeLessThan(255)

    const mid = sampleStatusBarFill('#4A90E2', 0.5)
    const full = sampleStatusBarFill('#4A90E2', 1)
    const start = sampleStatusBarFill('#4A90E2', 0)
    expect(start.r).toBeLessThan(74)
    expect(mid.r).toBeGreaterThan(start.r)
    expect(mid.r).toBeLessThan(full.r)
    expect(full.b).toBeGreaterThan(226)

    const gloss = sampleStatusBarGloss('#ff0000', 1)
    expect(gloss.g).toBeGreaterThan(tip.g)
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
      expect(draws[0]).toEqual(['image', sprite, 4, 10, 20, 2])
      expect(draws[1][0]).toBe('image')
      expect(draws[1].slice(2)).toEqual([4, 9, 20, 1])
      expect(draws[2]).toEqual(['image', getStatusBarFillSprite('#4A90E2', 'vertical'), 1, 3, 3, 9])
      expect(draws[3][0]).toBe('image')
      expect(draws[3].slice(2)).toEqual([1, 2, 3, 1])
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
    expect(first.r).toBeLessThan(255)
    expect(first.g).toBeLessThan(last.g)
    expect(last.g).toBeGreaterThan(40)
    expect(last.g).toBeLessThan(120)
    expect(ctx.lineWidth).toBe(4)

    const again = []
    ctx.stroke = function record() {
      again.push(this.strokeStyle)
    }
    strokeStatusArc(ctx, 0, 0, 12, 1, 2, '#ff0000')
    expect(again).toEqual(styles)
  })

  it('paints the rail from a cached sprite and strokes an inset hairline', () => {
    resetStatusBarGradientCacheForTests()
    const images = []
    const strokes = []
    const ctx = {
      strokeStyle: '#fff',
      lineWidth: 3,
      drawImage(...args) {
        images.push(args[0])
      },
      strokeRect(...args) {
        strokes.push([...args, this.strokeStyle, this.lineWidth])
      },
      createLinearGradient() {
        throw new Error('destination context should not allocate a gradient')
      }
    }

    drawStatusBar(ctx, 10, 20, 40, 4, 0.5, '#00ff00', 'horizontal')
    drawStatusBar(ctx, 10, 20, 40, 4, 0.25, '#00ff00', 'horizontal')

    expect(strokes).toEqual([
      [10.5, 20.5, 39, 3, STATUS_BAR_RAIL_EDGE, 1],
      [10.5, 20.5, 39, 3, STATUS_BAR_RAIL_EDGE, 1]
    ])
    expect(ctx.lineWidth).toBe(3)
    expect(ctx.strokeStyle).toBe('#fff')
    expect(images.length).toBe(6)
    expect(images[0]).toBe(images[3])
    expect(images[1]).toBe(images[4])
  })
})
