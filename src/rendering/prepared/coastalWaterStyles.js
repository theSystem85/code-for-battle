import { shoreOpacity } from './shoreDepthField.js'

const LAYERS = ['deep', 'band', 'column', 'bright', 'shimmer']
const BYTE_BUDGET = 64 * 1024 * 1024

// CPU fallback only: prepare exact bilinear seabed/mask patterns, shared by
// identical corner distances. Animation still uses the existing eleven fills.
export class CoastalWaterStyles {
  constructor() {
    this.key = ''
    this.tiles = new Map()
    this.bytes = 0
    this.builds = 0
  }

  prepare(ctx, depth, palette, tileSize, density = 1, sotMask = null) {
    const key = `${depth.builds}|${palette.tone}|${palette.saturation}|${density}`
    if (this.key === key) return
    this.key = key
    this.tiles.clear()
    this.bytes = 0
    if (!ctx.createPattern || typeof document === 'undefined') return
    const shapes = new Map()
    const size = Math.ceil((tileSize + 1) * density)
    const colors = LAYERS.map(layer => palette[layer].match(/[\d.]+/g).map(Number))
    const map = depth.map
    for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) {
      // Include SOT host cells as well as water and street underlays.
      if (map[y][x]?.type !== 'water' && map[y][x]?.type !== 'street' && sotMask?.[y]?.[x]?.type !== 'water') continue
      const corners = depth.corners(x, y)
      if (corners.every(value => value >= 5)) continue
      const shapeKey = corners.join(',')
      let styles = shapes.get(shapeKey)
      if (!styles) {
        const bytes = size * size * 4 * LAYERS.length
        if (this.bytes + bytes > BYTE_BUDGET) {
          throw new RangeError('Coastal Shallows CPU pattern preparation exceeds its 64 MiB budget')
        }
        styles = {}
        for (let layer = 0; layer < LAYERS.length; layer++) {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = size
          const source = canvas.getContext('2d')
          const pixels = source.createImageData(size, size)
          const color = colors[layer]
          for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
            const opacity = shoreOpacity(corners, px / (tileSize * density), py / (tileSize * density))
            const index = (py * size + px) * 4
            for (let channel = 0; channel < 3; channel++) {
              const sand = [194, 171, 117][channel]
              pixels.data[index + channel] = layer === 0 ? sand + (color[channel] - sand) * opacity : color[channel]
            }
            pixels.data[index + 3] = layer === 0 ? 255 : Math.round(opacity * 255)
          }
          source.putImageData(pixels, 0, 0)
          const pattern = ctx.createPattern(canvas, 'repeat')
          if (!pattern) {
            this.tiles.clear()
            this.key = ''
            return
          }
          pattern.setTransform(new window.DOMMatrix().scale(1 / density))
          styles[LAYERS[layer]] = pattern
        }
        this.bytes += bytes
        shapes.set(shapeKey, styles)
      }
      this.tiles.set(y * depth.width + x, styles)
    }
    this.builds++
  }
}
