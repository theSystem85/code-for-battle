import { describe, it, expect } from 'vitest'
import { isolateComponent } from '../../src/ui/sseIsolate.js'
import { detectSprites } from '../../src/ui/sseDetect.js'
import { applyBlackKey, applyEdgeConnectedBlackKey, buildBlackKeySeedMask } from '../../src/rendering/blackKeyPixels.js'
import { floodBorderBackground } from '../../src/rendering/decorationCutout.js'

// 10x10 black sheet with a bright 6x6 sprite at (2,2). The sprite has a
// bright frame and a 2x2 pure-black window inside plus a dark-grey pixel.
function spriteWithBlackInterior() {
  const width = 10
  const height = 10
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data[i * 4 + 3] = 255
  const set = (x, y, rgb) => { const i = (y * width + x) * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2] }
  for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) set(x, y, [200, 180, 120])
  for (let y = 4; y < 6; y++) for (let x = 4; x < 6; x++) set(x, y, [0, 0, 0])
  set(6, 3, [20, 20, 20])
  return { width, height, data }
}

const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3]

describe('sprite isolation keeps interior pixels', () => {
  it('click isolation copies black pixels enclosed by the sprite', () => {
    const image = spriteWithBlackInterior()
    const result = isolateComponent(image, 3, 3)
    expect(result.bbox).toEqual({ x: 2, y: 2, width: 6, height: 6 })
    const local = { width: 6, data: result.pixels }
    expect(alphaAt(local, 2, 2)).toBe(255) // black window, sheet (4,4)
    expect(alphaAt(local, 3, 3)).toBe(255)
    expect(result.pixels.slice((2 * 6 + 2) * 4, (2 * 6 + 2) * 4 + 3)).toEqual(new Uint8ClampedArray([0, 0, 0]))
    expect(alphaAt(local, 4, 1)).toBe(255) // dark-grey pixel
    // The dark-grey pixel is above the cutoff, so it is foreground; the 2x2 window is enclosed.
    expect(result.holes).toBe(4)
  })

  it('auto detection keeps interior pixels but drops background touching the bounding box edge', () => {
    const image = spriteWithBlackInterior()
    // Notch the frame so the top-left corner background reaches inside the box.
    const i = (2 * 10 + 2) * 4
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 0
    const [sprite] = detectSprites(image, { gap: 0 })
    expect(sprite.bbox).toEqual({ x: 2, y: 2, width: 6, height: 6 })
    const local = { width: 6, data: sprite.pixels }
    expect(alphaAt(local, 0, 0)).toBe(0) // edge-connected notch stays transparent
    expect(alphaAt(local, 2, 2)).toBe(255)
    expect(alphaAt(local, 3, 2)).toBe(255)
  })

  it('runtime black key removes only background connected to the sprite edge', () => {
    const image = spriteWithBlackInterior()
    const legacy = spriteWithBlackInterior()
    applyBlackKey(legacy.data)
    expect(alphaAt(legacy, 4, 4)).toBe(0) // the old global key ate the window

    applyEdgeConnectedBlackKey(image.data, image.width, image.height)
    expect(alphaAt(image, 0, 0)).toBe(0)
    expect(alphaAt(image, 9, 9)).toBe(0)
    expect(alphaAt(image, 4, 4)).toBe(255)
    expect(alphaAt(image, 5, 5)).toBe(255)
    expect(alphaAt(image, 6, 3)).toBe(255)
    expect(alphaAt(image, 3, 3)).toBe(255)
  })

  it('seeds tile edges but not the seams inside one multi-tile group', () => {
    // Two 5x10 cells forming one 2x1 group; a black stripe crosses the seam.
    const width = 10
    const height = 10
    const data = new Uint8ClampedArray(width * height * 4)
    for (let p = 0; p < width * height; p++) { data[p * 4] = 150; data[p * 4 + 3] = 255 }
    for (let x = 2; x < 8; x++) data[(5 * width + x) * 4] = 0
    const tiles = {
      '0,0': { rect: { x: 0, y: 0, width: 5, height: 10 }, tags: ['decorative', 'group_1'] },
      '1,0': { rect: { x: 5, y: 0, width: 5, height: 10 }, tags: ['decorative', 'group_1'] }
    }
    const grouped = data.slice()
    applyEdgeConnectedBlackKey(grouped, width, height, 24, 48, buildBlackKeySeedMask(width, height, { tiles }))
    expect(grouped[(5 * width + 4) * 4 + 3]).toBe(255)
    expect(grouped[(5 * width + 5) * 4 + 3]).toBe(255)
    // Two separate sprites: the shared edge is each sprite's outer edge.
    const split = data.slice()
    const separate = { '0,0': { ...tiles['0,0'], tags: ['decorative'] }, '1,0': { ...tiles['1,0'], tags: ['decorative'] } }
    applyEdgeConnectedBlackKey(split, width, height, 24, 48, buildBlackKeySeedMask(width, height, { tiles: separate }))
    expect(split[(5 * width + 4) * 4 + 3]).toBe(0)
    expect(split[(5 * width + 2) * 4 + 3]).toBe(0)
  })

  it('decoration cutout floods ground only from the group border', () => {
    const width = 6
    const height = 6
    const ground = new Uint8Array(width * height).fill(1)
    // A ring of non-ground pixels encloses ground-coloured (2,2)-(3,3).
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) if (x === 1 || x === 4 || y === 1 || y === 4) ground[y * width + x] = 0
    const reached = floodBorderBackground(null, width, height, index => ground[index] === 1)
    expect(reached[0]).toBe(1)
    expect(reached[2 * width + 2]).toBe(0)
    expect(reached[3 * width + 3]).toBe(0)
  })
})
