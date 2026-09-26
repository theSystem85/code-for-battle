import { describe, expect, it } from 'vitest'
import {
  contentRectFromRgba,
  milestoneBaseFromVideo,
  writeMilestoneVideoSourceRect
} from '../../src/ui/milestoneVideoCrop.js'

function paint(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y)
      const offset = (y * width + x) * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = 255
    }
  }
  return data
}

describe('milestone video content rect', () => {
  it('reads the clip base from the playback marker or the mp4 url', () => {
    expect(milestoneBaseFromVideo({ dataset: { milestoneBase: 'first_tank' }, src: 'video/other.mp4' })).toBe('first_tank')
    expect(milestoneBaseFromVideo({ src: 'https://play.test/video/air_strip.mp4?cache=1' })).toBe('air_strip')
    expect(milestoneBaseFromVideo({ currentSrc: '/video/first_artillery.mp4' })).toBe('first_artillery')
  })

  it('drops stable black pillarbox and letterbox bars', () => {
    const data = paint(40, 20, (x, y) => {
      if (x < 8 || x >= 32 || y < 4 || y >= 16) return [0, 0, 0]
      return [180, 140, 90]
    })
    expect(contentRectFromRgba(data, 40, 20)).toEqual({ x: 8, y: 4, width: 24, height: 12 })
  })

  it('keeps a full frame when the border is only a compression fringe', () => {
    const data = paint(30, 16, (x, y) => (x === 0 || y === 0 ? [2, 2, 2] : [40, 80, 120]))
    expect(contentRectFromRgba(data, 30, 16)).toBeNull()
  })

  it('writes the configured first_tank crop into the caller rect', () => {
    const out = { x: 1, y: 2, width: 3, height: 4 }
    const video = {
      videoWidth: 960,
      videoHeight: 576,
      dataset: { milestoneBase: 'first_tank' }
    }
    expect(writeMilestoneVideoSourceRect(out, video)).toBe(out)
    expect(out).toEqual({ x: 52, y: 0, width: 854, height: 576 })
    writeMilestoneVideoSourceRect(out, video)
    expect(out).toEqual({ x: 52, y: 0, width: 854, height: 576 })
  })

  it('uses the full frame for clips that were measured with no bars', () => {
    const out = { x: 9, y: 9, width: 9, height: 9 }
    writeMilestoneVideoSourceRect(out, {
      videoWidth: 1280,
      videoHeight: 720,
      src: 'video/tank_over_crystals.mp4'
    })
    expect(out).toEqual({ x: 0, y: 0, width: 1280, height: 720 })
    writeMilestoneVideoSourceRect(out, {
      videoWidth: 1280,
      videoHeight: 720,
      dataset: { milestoneBase: 'tesla_coil_hits_tank' }
    })
    expect(out).toEqual({ x: 0, y: 0, width: 1280, height: 720 })
  })

  it('scales a configured crop when the decoded frame size differs', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 }
    writeMilestoneVideoSourceRect(out, {
      videoWidth: 480,
      videoHeight: 288,
      dataset: { milestoneBase: 'air_strip' }
    })
    expect(out).toEqual({ x: 96, y: 0, width: 288, height: 288 })
  })
})
