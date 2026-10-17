import { copyComponentWithInterior } from './sseIsolate.js'

// Pure source processing. A gap of one pixel is bridged by default; only
// original pixels are copied (foreground plus what it encloses), so merging
// never paints the gap.
export function detectSprites({ width, height, data }, { cutoff = 16, minArea = 2, gap = 1 } = {}) {
  if (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 255
    || !Number.isInteger(minArea) || minArea < 2 || !Number.isInteger(gap) || gap < 0 || gap > 2) throw new Error('Invalid detection options.')
  const mask = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4 + 3] > 0 && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > cutoff ? 1 : 0
  }
  const components = []
  const radius = gap + 1
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue
    let head = 0
    let tail = 1
    queue[0] = start
    mask[start] = 0
    let left = start % width
    let right = left
    let top = Math.floor(start / width)
    let bottom = top
    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      for (let ny = Math.max(0, y - radius); ny <= Math.min(height - 1, y + radius); ny++) {
        for (let nx = Math.max(0, x - radius); nx <= Math.min(width - 1, x + radius); nx++) {
          const next = ny * width + nx
          if (mask[next]) {
            mask[next] = 0
            queue[tail++] = next
          }
        }
      }
    }
    if (tail < minArea) continue
    const bbox = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
    // Interior pixels (dark detail, enclosed holes) stay; only edge-connected background is dropped.
    const { pixels, holes } = copyComponentWithInterior({ width, data }, bbox, queue, tail)
    components.push({ bbox, pixels, area: tail, holes })
  }
  return components
}
