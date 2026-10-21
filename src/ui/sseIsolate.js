export function hasTransparency({ data }) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

export function validateAlphaOptions({ alphaCutoff = 0, gap = 0, minArea = 2 }) {
  if (!Number.isInteger(alphaCutoff) || alphaCutoff < 0 || alphaCutoff > 254
    || !Number.isInteger(gap) || gap < 0 || gap > 2
    || !Number.isInteger(minArea) || minArea < 2) throw new Error('Invalid transparency detection options.')
}

// Event-driven image processing only; no simulation/render-loop work.
export function isolateComponent(image, x, y, cutoff = 16, { innerCuts = false, transparent = false, alphaCutoff = 0, gap = 0 } = {}) {
  const { width, height, data } = image
  x = Math.floor(x)
  y = Math.floor(y)
  if (!transparent && (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 255)) throw new Error('Cutoff must be between 0 and 255.')
  if (transparent) validateAlphaOptions({ alphaCutoff, gap })
  innerCuts = !transparent && innerCuts
  const foreground = (index) => transparent ? data[index * 4 + 3] > alphaCutoff : data[index * 4 + 3] > 0 && Math.max(data[index * 4], data[index * 4 + 1], data[index * 4 + 2]) > cutoff
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height || !foreground(y * width + x)) return null
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 1
  queue[0] = y * width + x
  visited[queue[0]] = 1
  let left = x
  let right = x
  let top = y
  let bottom = y
  while (head < tail) {
    const index = queue[head++]
    const px = index % width
    const py = Math.floor(index / width)
    left = Math.min(left, px)
    right = Math.max(right, px)
    top = Math.min(top, py)
    bottom = Math.max(bottom, py)
    const visit = (next) => {
      if (!visited[next] && foreground(next)) {
        visited[next] = 1
        queue[tail++] = next
      }
    }
    if (transparent) {
      // Eight-connected alpha contours keep diagonal outlines together. Gap
      // bridging groups detached nearby pixels without painting the gap.
      const radius = gap + 1
      for (let ny = Math.max(0, py - radius); ny <= Math.min(height - 1, py + radius); ny++) {
        for (let nx = Math.max(0, px - radius); nx <= Math.min(width - 1, px + radius); nx++) visit(ny * width + nx)
      }
    } else {
      if (px > 0) visit(index - 1)
      if (px + 1 < width) visit(index + 1)
      if (py > 0) visit(index - width)
      if (py + 1 < height) visit(index + width)
    }
  }
  const bbox = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
  const { pixels, holes } = (transparent || innerCuts) ? copyComponentOnly(image, bbox, queue, tail) : copyComponentWithInterior(image, bbox, queue, tail)
  return { bbox, pixels, area: tail, holes, innerCuts }
}

/**
 * Copy a component's pixels into its bounding box, plus every pixel the
 * silhouette encloses. Only background connected to the bounding-box edge
 * stays transparent, so dark or black detail inside a sprite (windows,
 * shadows, outlines around holes) is never stripped.
 */
export function copyComponentWithInterior({ width, data }, bbox, indices, count = indices.length) {
  const local = new Uint8Array(bbox.width * bbox.height)
  for (let i = 0; i < count; i++) {
    const index = indices[i]
    local[(Math.floor(index / width) - bbox.y) * bbox.width + index % width - bbox.x] = 1
  }
  // Flood the non-component pixels from the bounding-box edge: what it
  // cannot reach is enclosed by the sprite.
  const outside = new Uint8Array(local.length)
  const queue = new Int32Array(local.length)
  let head = 0
  let tail = 0
  const seed = offset => {
    if (!local[offset] && !outside[offset]) { outside[offset] = 1; queue[tail++] = offset }
  }
  for (let x = 0; x < bbox.width; x++) { seed(x); seed((bbox.height - 1) * bbox.width + x) }
  for (let y = 0; y < bbox.height; y++) { seed(y * bbox.width); seed(y * bbox.width + bbox.width - 1) }
  while (head < tail) {
    const offset = queue[head++]
    const x = offset % bbox.width
    if (x > 0) seed(offset - 1)
    if (x + 1 < bbox.width) seed(offset + 1)
    if (offset >= bbox.width) seed(offset - bbox.width)
    if (offset + bbox.width < local.length) seed(offset + bbox.width)
  }
  const pixels = new Uint8ClampedArray(local.length * 4)
  let holes = 0
  for (let offset = 0; offset < local.length; offset++) {
    if (outside[offset]) continue
    if (!local[offset]) holes++
    const x = offset % bbox.width
    const y = (offset - x) / bbox.width
    const source = ((bbox.y + y) * width + bbox.x + x) * 4
    pixels.set(data.subarray(source, source + 4), offset * 4)
  }
  return { pixels, holes }
}

/**
 * `inner_cuts` variant: copy only the component's own (non-black) pixels, so
 * black background enclosed by the silhouette (gaps between branches, fence
 * slats, arches) becomes transparent too. `holes` counts the enclosed
 * background pixels that were cut.
 */
export function copyComponentOnly({ width, data }, bbox, indices, count = indices.length) {
  const pixels = new Uint8ClampedArray(bbox.width * bbox.height * 4)
  for (let i = 0; i < count; i++) {
    const index = indices[i]
    const offset = (Math.floor(index / width) - bbox.y) * bbox.width + index % width - bbox.x
    pixels.set(data.subarray(index * 4, index * 4 + 4), offset * 4)
  }
  const { holes } = copyComponentWithInterior({ width, data }, bbox, indices, count)
  return { pixels, holes }
}
